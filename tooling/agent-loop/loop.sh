#!/usr/bin/env bash
# Agent loop: works through GitHub issues with headless Claude Code.
#
# Each tick it first tends the PRs it opened (merge conflicts, failing CI, new
# review comments), then picks the lowest-numbered open `slice` issue whose
# "Blocked by #N" issues are all closed, implements it in its own git worktree,
# reviews it in a separate session, fixes, and opens a PR.
#
# With --worker it skips the PR tending and only implements, so several loops
# can run side by side on one machine: one normal loop plus any number of
# workers. Claims and shared git operations go through local locks.
#
# It never merges. The human merges, and the merge closes the issue through
# "Closes #N", which is what unblocks the issues that depend on it.
# Setup and usage: tooling/agent-loop/README.md.
set -euo pipefail

LOOP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# The main checkout, even when this script runs from a worktree, so every loop
# on the machine shares one .loop/ (locks, logs) and one worktree folder.
REPO_ROOT="$(dirname "$(git -C "$LOOP_DIR" rev-parse --path-format=absolute --git-common-dir)")"
STATE_DIR="$REPO_ROOT/.loop"
LOG_DIR="$STATE_DIR/logs"
WT_ROOT="$REPO_ROOT/.claude/worktrees"

ISSUE_LABEL="slice"
LABEL_WIP="agent:wip"
LABEL_PR="agent:pr"
LABEL_STUCK="agent:stuck"

POLL=600
BUDGET=15
MAX_ISSUES=0
MODEL=""
SESSION_TIMEOUT=5400
MAX_REVIEW_ROUNDS=3
MAX_FIX_ATTEMPTS=2
MAX_STUCK_STREAK=2
LOCK_WAIT=900
ONCE=false
WORKER=false
DRY_RUN=false
PREFLIGHT_ONLY=false

REPO=""
CURRENT_ISSUE=""
LAST_LOG=""
PREFLIGHT_FAILS=0

# Commit or PR text that must never ship (see CLAUDE.md "Git and PRs").
ATTRIBUTION_RE='co-authored-by:.*(claude|anthropic)|generated with .{0,3}claude'

usage() {
  cat <<'EOF'
Usage: tooling/agent-loop/loop.sh [options]

  --preflight        check that this machine is ready, then exit
  --dry-run          show each open slice issue, whether it is ready, and which one would be picked
  --once             one tick (tend PRs, then at most one issue), then exit
  --worker           only implement issues; leave PR tending to the one normal loop
  --max-issues N     stop after N issues (default: no limit)
  --poll SECONDS     wait between checks when nothing is ready (default 600)
  --budget USD       spending cap per Claude session (default 15)
  --model NAME       model for every Claude session (default: the CLI default)
  -h, --help         this help
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --preflight) PREFLIGHT_ONLY=true ;;
    --dry-run) DRY_RUN=true ;;
    --once) ONCE=true ;;
    --worker) WORKER=true ;;
    --max-issues) MAX_ISSUES="${2:?--max-issues needs a number}"; shift ;;
    --poll) POLL="${2:?--poll needs seconds}"; shift ;;
    --budget) BUDGET="${2:?--budget needs an amount}"; shift ;;
    --model) MODEL="${2:?--model needs a name}"; shift ;;
    -h | --help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

# --- locks -----------------------------------------------------------------
# Mutexes between loops on this machine: a lock is a file holding its owner's
# pid, created with bash's noclobber (O_EXCL). Not mkdir: uutils coreutils
# (Ubuntu 26.04's default) lets several racing `mkdir`s of one new directory
# all succeed. Not flock: macOS lacks it. A lock whose owner died is taken over.

lock_file() { echo "$STATE_DIR/locks/$1.lock"; }

# Creates <file> holding this loop's pid; fails if it already exists.
create_exclusive() { (set -C && echo "$$" >"$1") 2>/dev/null; }

older_than_a_minute() { [ -n "$(find "$1" -maxdepth 0 -mmin +1 2>/dev/null)" ]; }

# True when <file>'s owner died: its pid is gone, or the file is still empty
# after a minute (the owner died between creating it and writing the pid).
lock_is_stale() { # <file>
  local pid
  pid="$(cat "$1" 2>/dev/null || true)"
  if [ -n "$pid" ]; then
    ! kill -0 "$pid" 2>/dev/null
  else
    [ -e "$1" ] && older_than_a_minute "$1"
  fi
}

# Removes <file> if its owner died. Only one loop reaps at a time, and it checks
# again once it holds the reap lock. Without that, a loop that saw the dead
# owner could delete the lock a live loop has taken since.
reap_stale_lock() { # <file>
  local reap="$1.reap"
  if ! create_exclusive "$reap"; then
    # A reaper that died leaves its file behind; reaping takes milliseconds.
    if older_than_a_minute "$reap"; then rm -f "$reap"; fi
    return 0
  fi
  if lock_is_stale "$1"; then rm -f "$1"; fi
  rm -f "$reap"
}

lock_acquire() { # <name>
  local file pid waited=0
  file="$(lock_file "$1")"
  mkdir -p "$STATE_DIR/locks"
  until create_exclusive "$file"; do
    if lock_is_stale "$file"; then
      reap_stale_lock "$file"
      continue
    fi
    if [ "$waited" -ge "$LOCK_WAIT" ]; then
      pid="$(cat "$file" 2>/dev/null || true)"
      log "  gave up waiting for the $1 lock (held by pid ${pid:-?})" >&2
      return 1
    fi
    sleep 1
    waited=$((waited + 1))
  done
}

lock_release() { # <name>
  local file
  file="$(lock_file "$1")"
  if [ "$(cat "$file" 2>/dev/null || true)" = "$$" ]; then rm -f "$file"; fi
}

release_my_locks() {
  local file
  for file in "$STATE_DIR"/locks/*.lock; do
    [ -e "$file" ] || continue
    if [ "$(cat "$file" 2>/dev/null || true)" = "$$" ]; then rm -f "$file"; fi
  done
}

with_lock() { # <name> <command...>
  local name="$1" status=0
  shift
  lock_acquire "$name" || return 1
  "$@" || status=$?
  lock_release "$name"
  return "$status"
}

# Fetching, adding or removing worktrees, pushing (-u writes .git/config) and
# rewriting commits all write shared files in the common .git directory, so
# loops take turns.
git_locked() { with_lock git git "$@"; }

# --- toolchain -------------------------------------------------------------

node_is_22() { command -v node >/dev/null 2>&1 && [[ "$(node -v)" == v22.* ]]; }

setup_toolchain() {
  if ! node_is_22; then
    local nvm_sh="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
    if [ -s "$nvm_sh" ]; then
      # nvm does not support `set -eu`.
      set +eu
      # shellcheck source=/dev/null
      . "$nvm_sh"
      nvm use "$(cat "$REPO_ROOT/.nvmrc")" >/dev/null 2>&1
      set -eu
    fi
  fi
  export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
  # Claude, the verify hook and Playwright call plain `pnpm`. Give them a shim
  # when only corepack is installed.
  if ! command -v pnpm >/dev/null 2>&1 && command -v corepack >/dev/null 2>&1; then
    mkdir -p "$STATE_DIR/bin"
    # Write then rename: another loop may be running the shim right now.
    printf '#!/usr/bin/env bash\nexec corepack pnpm "$@"\n' >"$STATE_DIR/bin/pnpm.$$"
    chmod +x "$STATE_DIR/bin/pnpm.$$"
    mv -f "$STATE_DIR/bin/pnpm.$$" "$STATE_DIR/bin/pnpm"
    export PATH="$STATE_DIR/bin:$PATH"
  fi
  # Agent work never touches the real-data database (CLAUDE.md "Commands").
  export DATABASE_URL="postgres://investhub:investhub@127.0.0.1:55432/investhub_dev"
}

# --- preflight -------------------------------------------------------------

check() { # <name> <hint> <command...>
  local name="$1" hint="$2"
  shift 2
  if "$@" >/dev/null 2>&1; then
    log "ok    $name"
  else
    log "FAIL  $name: $hint"
    PREFLIGHT_FAILS=$((PREFLIGHT_FAILS + 1))
  fi
}

claude_logged_in() {
  [ -n "${ANTHROPIC_API_KEY:-}" ] || claude auth status 2>/dev/null | grep -Eq '"loggedIn": *true'
}
git_identity() { git config user.name && git config user.email; }
repo_on_github() { gh repo view --json nameWithOwner --jq .nameWithOwner; }

preflight() {
  PREFLIGHT_FAILS=0
  check "git" "install git" command -v git
  check "gh logged in" "install the GitHub CLI and run: gh auth login" gh auth status
  check "claude installed" "curl -fsSL https://claude.ai/install.sh | bash" command -v claude
  check "claude logged in" "run claude once and type /login" claude_logged_in
  check "node 22" "install nvm, then: nvm install 22" node_is_22
  check "corepack" "comes with Node 22; run: corepack enable" command -v corepack
  check "pnpm" "run: corepack enable" pnpm --version
  check "docker running" "start Docker (your user must be able to run docker without sudo)" docker info
  check "postgres up" "docker compose up -d --wait failed; see its output" docker compose up -d --wait
  check "git identity" "git config --global user.name/user.email" git_identity
  check "repo on GitHub" "clone from GitHub so gh can see the repo" repo_on_github
  command -v timeout >/dev/null 2>&1 || log "note  no 'timeout' command: Claude sessions run without a time limit"
  [ "$PREFLIGHT_FAILS" -eq 0 ]
}

# --- GitHub helpers --------------------------------------------------------
# `gh issue edit` / `gh pr edit` fail on this repo (Projects classic), so labels
# go through the REST API.

add_label() { gh api -X POST "repos/$REPO/issues/$1/labels" -f "labels[]=$2" >/dev/null; }
remove_label() { gh api -X DELETE "repos/$REPO/issues/$1/labels/${2//:/%3A}" >/dev/null 2>&1 || true; }
issue_agent_labels() { gh api "repos/$REPO/issues/$1" --jq '[.labels[].name | select(startswith("agent:"))] | join(",")'; }

ensure_labels() {
  gh label create "$LABEL_WIP" --repo "$REPO" --force --color FBCA04 --description "Agent loop is working on it" >/dev/null
  gh label create "$LABEL_PR" --repo "$REPO" --force --color 0E8A16 --description "Agent loop opened a PR; waiting for a human" >/dev/null
  gh label create "$LABEL_STUCK" --repo "$REPO" --force --color D93F0B --description "Agent loop gave up; needs a human" >/dev/null
}

# One line per open slice issue: number<TAB>status<TAB>title, lowest first.
# Status is "ready", "blocked by #a #b" or "claimed (agent:...)".
issue_table() {
  local open num title agent_labels deps d blocked status
  open=" $(gh issue list --repo "$REPO" --state open --limit 500 --json number --jq '.[].number' | tr '\n' ' ') "
  # Fields are split on \x1f, not tabs: read collapses runs of whitespace
  # separators, so an empty labels field would shift the columns.
  while IFS=$'\x1f' read -r num title agent_labels deps; do
    if [ -n "$agent_labels" ]; then
      status="claimed ($agent_labels)"
    else
      blocked=""
      for d in ${deps//,/ }; do
        if [ "$d" != "$num" ] && [[ "$open" == *" $d "* ]]; then blocked+=" #$d"; fi
      done
      if [ -n "$blocked" ]; then status="blocked by${blocked}"; else status="ready"; fi
    fi
    printf '%s\t%s\t%s\n' "$num" "$status" "$title"
  done < <(gh issue list --repo "$REPO" --state open --label "$ISSUE_LABEL" --limit 500 \
    --json number,title,labels,body \
    --jq '.[] | [
      .number,
      .title,
      ([.labels[].name | select(startswith("agent:"))] | join(",")),
      ([(.body // "") | scan("(?i)blocked by([^.\n]*)")[]] | join(" ")
        | [scan("#([0-9]+)")[]] | unique | join(","))
    ] | map(tostring) | join("\u001f")') | sort -n
}

# Claims the lowest ready issue with agent:wip and prints its number, or prints
# nothing. The claim lock makes "read labels, then label" atomic between loops
# on this machine. Loops on two machines are not covered: run on one machine.
claim_issue() {
  local n
  lock_acquire claim || return 0
  for n in $(issue_table | awk -F'\t' '$2 == "ready" { print $1 }'); do
    if [ -z "$(issue_agent_labels "$n")" ] && add_label "$n" "$LABEL_WIP"; then
      lock_release claim
      echo "$n"
      return 0
    fi
  done
  lock_release claim
}

# --- worktrees -------------------------------------------------------------

worktree_for() { echo "$WT_ROOT/loop-$1"; }

slugify() {
  LC_ALL=C sed -E 's/^S[0-9]+[a-z]? · //' <<<"$1" | LC_ALL=C tr '[:upper:]' '[:lower:]' |
    LC_ALL=C sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' | cut -d- -f1-6
}

# Reuses an existing feat/<n>-* branch (local or remote) so reruns resume.
branch_for() { # <issue> <title>
  local existing
  existing="$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' \
    "refs/heads/feat/$1-*" "refs/remotes/origin/feat/$1-*" | head -n 1)"
  if [ -n "$existing" ]; then echo "${existing#origin/}"; else echo "feat/$1-$(slugify "$2")"; fi
}

fetch_and_add_worktree() { # <worktree> <branch>  (run under the git lock)
  local wt="$1" branch="$2"
  git -C "$REPO_ROOT" fetch --quiet --prune origin || return 1
  [ -d "$wt" ] && return 0
  if git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$REPO_ROOT" worktree add --quiet "$wt" "$branch"
  elif git -C "$REPO_ROOT" show-ref --verify --quiet "refs/remotes/origin/$branch"; then
    git -C "$REPO_ROOT" worktree add --quiet -b "$branch" "$wt" "origin/$branch"
  else
    git -C "$REPO_ROOT" worktree add --quiet -b "$branch" "$wt" origin/main
  fi
}

setup_worktree() { # <issue> <branch>
  local n="$1" branch="$2" wt
  wt="$(worktree_for "$n")"
  with_lock git fetch_and_add_worktree "$wt" "$branch" || return 1
  mkdir -p "$wt/.loop"
  if ! (cd "$wt" && pnpm install --frozen-lockfile) >"$wt/.loop/install.log" 2>&1; then
    log "  pnpm install failed; see $wt/.loop/install.log"
    return 1
  fi
}

# --- Claude sessions -------------------------------------------------------

# Prints one field of the final "result" message in a stream-json log.
result_field() { # <log> <field>
  node -e '
    const fs = require("fs");
    const [file, field] = process.argv.slice(1);
    let lines = [];
    try { lines = fs.readFileSync(file, "utf8").split("\n"); } catch {}
    for (let i = lines.length - 1; i >= 0; i--) {
      let msg;
      try { msg = JSON.parse(lines[i]); } catch { continue; }
      if (msg.type !== "result") continue;
      const v = msg[field];
      if (v !== undefined && v !== null) process.stdout.write(typeof v === "string" ? v : JSON.stringify(v));
      break;
    }
  ' "$1" "$2"
}

review_verdict() { # <review.json>
  node -e '
    try { process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).verdict || ""); } catch {}
  ' "$1"
}

review_markdown() { # <review.json>
  node -e '
    let r;
    try { r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); } catch { console.log("No review ran."); process.exit(0); }
    console.log(`Verdict: **${r.verdict}**. ${r.summary || ""}`.trim());
    const findings = r.findings || [];
    if (findings.length) console.log("");
    for (const f of findings) console.log(`- **${f.severity}** \`${f.file}${f.line ? ":" + f.line : ""}\`: ${f.summary}`);
  ' "$1"
}

render() { # <template> <issue> <branch> [reason]
  local text k_issue='{{ISSUE}}' k_branch='{{BRANCH}}' k_reason='{{REASON}}'
  text="$(cat "$1")"
  text="${text//"$k_issue"/"$2"}"
  text="${text//"$k_branch"/"$3"}"
  text="${text//"$k_reason"/"${4:-}"}"
  printf '%s' "$text"
}

# Runs one headless session in <worktree>, logging stream-json to .loop/logs.
# Fails when the session errors (budget, timeout, crash).
run_claude() { # <role> <issue> <worktree> <prompt> [extra claude args...]
  local role="$1" n="$2" wt="$3" prompt="$4" status=0
  shift 4
  LAST_LOG="$LOG_DIR/$n-$role-$(date +%Y%m%d-%H%M%S).jsonl"
  local cmd=(claude -p "$prompt"
    --settings "$LOOP_DIR/settings.json"
    --permission-mode dontAsk
    --output-format stream-json --verbose
    --max-budget-usd "$BUDGET"
    --no-session-persistence)
  if [ -n "$MODEL" ]; then cmd+=(--model "$MODEL"); fi
  cmd+=("$@")
  if command -v timeout >/dev/null 2>&1; then cmd=(timeout "$SESSION_TIMEOUT" "${cmd[@]}"); fi
  log "  claude $role (log: ${LAST_LOG#"$REPO_ROOT/"})"
  (cd "$wt" && "${cmd[@]}") >"$LAST_LOG" 2>"$LAST_LOG.err" </dev/null || status=$?
  if [ "$status" -ne 0 ] || [ "$(result_field "$LAST_LOG" is_error)" != "false" ]; then
    log "  claude $role failed (exit $status, $(result_field "$LAST_LOG" subtype))"
    return 1
  fi
  log "  claude $role done (\$$(result_field "$LAST_LOG" total_cost_usd))"
}

# Backup for the attribution settings: strips Claude trailers from commits that
# are not pushed yet. Only rewrites <base>..<branch>, never pushed history.
scrub_attribution() { # <worktree> <base> <branch>
  local wt="$1" base="$2" branch="$3"
  if git -C "$wt" log --format=%B "$base..$branch" | grep -Eiq "$ATTRIBUTION_RE"; then
    log "  removing Claude attribution from commit messages"
    # filter-branch keeps refs/original in the shared .git: take the git lock.
    (cd "$wt" && FILTER_BRANCH_SQUELCH_WARNING=1 git_locked filter-branch -f \
      --msg-filter "grep -Eiv '$ATTRIBUTION_RE' || true" -- "$base..$branch") >/dev/null 2>&1 ||
      log "  could not rewrite commit messages; check them before merging"
  fi
}

run_gate() { # <worktree>
  log "  gate: lint, typecheck, test"
  (cd "$1" && pnpm lint && pnpm typecheck && pnpm test) >"$1/.loop/test-output.txt" 2>&1
}

gate_or_fix() { # <issue> <branch> <worktree> <base>
  run_gate "$3" && return 0
  log "  gate failed; one fix attempt"
  run_claude fix "$1" "$3" "$(render "$LOOP_DIR/prompts/fix.md" "$1" "$2" \
    "pnpm lint, typecheck or test fails. The output is in .loop/test-output.txt.")" || return 1
  scrub_attribution "$3" "$4" "$2"
  run_gate "$3"
}

# --- PRs -------------------------------------------------------------------

open_pr() { # <issue> <branch> <worktree> <draft:true|false> [stuck reason]
  local n="$1" branch="$2" wt="$3" draft="$4" reason="${5:-}" title body pr existing
  title="$(head -n 1 "$wt/.loop/pr-title.txt" 2>/dev/null || true)"
  [ -n "$title" ] || title="$(git -C "$wt" log --reverse --format=%s origin/main..HEAD | head -n 1)"
  body="$wt/.loop/pr-body.final.md"
  {
    if [ -s "$wt/.loop/pr-body.md" ]; then
      grep -v '^Closes #' "$wt/.loop/pr-body.md" | grep -Eiv "$ATTRIBUTION_RE" || true
    else
      printf '## Summary\n\n'
      git -C "$wt" log --reverse --format='- %s' origin/main..HEAD
    fi
    printf '\n## Agent review\n\n'
    review_markdown "$wt/.loop/review.json"
    if [ "$draft" = true ]; then printf '\n**Stuck:** %s. Needs a human.\n' "$reason"; fi
    printf '\nCloses #%s\n' "$n"
  } >"$body"

  git_locked -C "$wt" push --quiet -u origin "$branch" || return 1
  existing="$(gh pr list --repo "$REPO" --head "$branch" --state open --json number --jq '.[0].number // ""')"
  if [ -n "$existing" ]; then
    log "  pushed to existing PR #$existing"
    pr="$existing"
  else
    pr="$(gh api -X POST "repos/$REPO/pulls" -f title="$title" -f head="$branch" -f base=main \
      -F body=@"$body" -F draft="$draft" --jq .number)" || return 1
    if [ "$draft" = true ]; then log "  opened draft PR #$pr"; else log "  opened PR #$pr"; fi
  fi
  if [ "$draft" = true ]; then add_label "$pr" "$LABEL_STUCK"; else add_label "$pr" "$LABEL_PR"; fi
}

mark_stuck() { # <issue> <branch> <worktree> <reason>
  local n="$1" branch="$2" wt="$3" reason="$4"
  log "  STUCK #$n: $reason"
  remove_label "$n" "$LABEL_WIP"
  add_label "$n" "$LABEL_STUCK"
  if [ -d "$wt" ] && [ "$(git -C "$wt" rev-list --count origin/main..HEAD 2>/dev/null || echo 0)" -gt 0 ]; then
    open_pr "$n" "$branch" "$wt" true "$reason" || log "  could not open a draft PR"
  fi
  CURRENT_ISSUE=""
}

# --- one issue -------------------------------------------------------------

work_issue() { # <issue>, already labelled agent:wip by claim_issue
  local n="$1" title branch wt round verdict=""
  CURRENT_ISSUE="$n"
  title="$(gh issue view "$n" --repo "$REPO" --json title --jq .title)"
  branch="$(branch_for "$n" "$title")"
  wt="$(worktree_for "$n")"
  log "#$n $title -> $branch"

  if ! setup_worktree "$n" "$branch"; then
    mark_stuck "$n" "$branch" "$wt" "worktree setup failed"
    return 1
  fi
  rm -f "$wt/.loop/review.json"

  if ! run_claude implement "$n" "$wt" "$(render "$LOOP_DIR/prompts/implement.md" "$n" "$branch")"; then
    mark_stuck "$n" "$branch" "$wt" "the implementer session failed"
    return 1
  fi
  scrub_attribution "$wt" origin/main "$branch"
  if [ "$(git -C "$wt" rev-list --count origin/main..HEAD)" -eq 0 ]; then
    mark_stuck "$n" "$branch" "$wt" "the implementer made no commits"
    return 1
  fi
  if ! gate_or_fix "$n" "$branch" "$wt" origin/main; then
    mark_stuck "$n" "$branch" "$wt" "lint, typecheck or tests still fail after a fix attempt"
    return 1
  fi

  for round in $(seq 1 "$MAX_REVIEW_ROUNDS"); do
    log "  review round $round/$MAX_REVIEW_ROUNDS"
    if ! run_claude review "$n" "$wt" "$(render "$LOOP_DIR/prompts/review.md" "$n" "$branch")" \
      --json-schema "$(cat "$LOOP_DIR/review-schema.json")"; then
      mark_stuck "$n" "$branch" "$wt" "the reviewer session failed"
      return 1
    fi
    result_field "$LAST_LOG" structured_output >"$wt/.loop/review.json"
    verdict="$(review_verdict "$wt/.loop/review.json")"
    log "  verdict: ${verdict:-none}"
    if [ "$verdict" = approve ] || [ "$round" -eq "$MAX_REVIEW_ROUNDS" ]; then break; fi
    if ! run_claude fix "$n" "$wt" "$(render "$LOOP_DIR/prompts/fix.md" "$n" "$branch" \
      "the review findings in .loop/review.json. Fix every blocker and major finding; minor ones are optional.")"; then
      mark_stuck "$n" "$branch" "$wt" "the fixer session failed"
      return 1
    fi
    scrub_attribution "$wt" origin/main "$branch"
    if ! gate_or_fix "$n" "$branch" "$wt" origin/main; then
      mark_stuck "$n" "$branch" "$wt" "lint, typecheck or tests fail after review fixes"
      return 1
    fi
  done

  if [ "$verdict" != approve ]; then
    mark_stuck "$n" "$branch" "$wt" "the reviewer still asks for changes after $MAX_REVIEW_ROUNDS rounds"
    return 1
  fi
  if ! open_pr "$n" "$branch" "$wt" false; then
    mark_stuck "$n" "$branch" "$wt" "pushing or opening the PR failed"
    return 1
  fi
  remove_label "$n" "$LABEL_WIP"
  add_label "$n" "$LABEL_PR"
  CURRENT_ISSUE=""
}

# --- tending open PRs ------------------------------------------------------

issue_of_branch() { local rest="${1#*/}"; echo "${rest%%-*}"; }

# Removes worktrees of agent PRs that were merged or closed. A PR closed
# without merging marks its issue stuck, so the loop does not redo it.
cleanup_finished() {
  local label pr branch state n wt
  for label in "$LABEL_PR" "$LABEL_STUCK"; do
    while IFS=$'\t' read -r pr branch state; do
      [ -n "$pr" ] || continue
      n="$(issue_of_branch "$branch")"
      wt="$(worktree_for "$n")"
      [ -d "$wt" ] || continue
      log "PR #$pr is $state; removing its worktree"
      git_locked -C "$REPO_ROOT" worktree remove --force "$wt" || true
      git_locked -C "$REPO_ROOT" branch -D "$branch" >/dev/null 2>&1 || true
      rm -f "$STATE_DIR/pr-$pr".*
      if [ "$state" = CLOSED ] && [ "$label" = "$LABEL_PR" ]; then
        remove_label "$n" "$LABEL_PR"
        add_label "$n" "$LABEL_STUCK"
      fi
    done < <(gh pr list --repo "$REPO" --state all --label "$label" --limit 50 \
      --json number,headRefName,state --jq '.[] | select(.state != "OPEN") | [.number, .headRefName, .state] | @tsv')
  done
}

# Human comments on <pr> newer than <since> (ISO time), one JSON object per line.
# The loop never comments, so every non-bot comment is human feedback.
fetch_feedback() { # <pr> <since>
  local pr="$1" since="$2" sel
  sel="select(.user.type != \"Bot\") | select((.body // \"\") != \"\")"
  gh api --paginate "repos/$REPO/issues/$pr/comments" \
    --jq ".[] | $sel | select(.created_at > \"$since\") | {at: .created_at, user: .user.login, body}"
  gh api --paginate "repos/$REPO/pulls/$pr/comments" \
    --jq ".[] | $sel | select(.created_at > \"$since\") | {at: .created_at, user: .user.login, path, line, body}"
  gh api --paginate "repos/$REPO/pulls/$pr/reviews" \
    --jq ".[] | $sel | select(.submitted_at > \"$since\") | {at: .submitted_at, user: .user.login, state, body}"
}

tend_pr() { # <pr> <branch>
  local pr="$1" branch="$2" n wt mergeable ci reason="" since newest attempts before
  n="$(issue_of_branch "$branch")"
  wt="$(worktree_for "$n")"
  IFS=$'\t' read -r mergeable ci < <(gh pr view "$pr" --repo "$REPO" --json mergeable,statusCheckRollup --jq '
    [.mergeable,
     ([(.statusCheckRollup // [])[] | (.conclusion // .state // "") | ascii_upcase] as $s
      | [(.statusCheckRollup // [])[] | select((.status // "COMPLETED") != "COMPLETED" or .state == "PENDING")] as $p
      | if any($s[]; . == "FAILURE" or . == "ERROR" or . == "TIMED_OUT" or . == "CANCELLED" or . == "ACTION_REQUIRED" or . == "STARTUP_FAILURE") then "fail"
        elif ($p | length) > 0 then "pending" else "pass" end)
    ] | @tsv')

  if [ "$mergeable" = CONFLICTING ]; then
    reason="the branch conflicts with main. Run \`git merge origin/main\` (never rebase: the branch is pushed), resolve the conflicts keeping both sides' intent, and commit the merge."
  elif [ "$ci" = fail ]; then
    reason="CI fails on PR #$pr. Find the failure with \`gh pr checks $pr\` and \`gh run view <run-id> --log-failed\`."
  fi

  since="$(cat "$STATE_DIR/pr-$pr.seen" 2>/dev/null || echo "")"
  mkdir -p "$STATE_DIR/feedback"
  fetch_feedback "$pr" "$since" >"$STATE_DIR/feedback/pr-$pr.jsonl" || true
  newest="$(grep -o '"at":"[^"]*"' "$STATE_DIR/feedback/pr-$pr.jsonl" | cut -d'"' -f4 | sort | tail -n 1 || true)"
  if [ -n "$newest" ]; then
    reason="${reason:+$reason Also: }human review comments on PR #$pr, in .loop/feedback.jsonl (one JSON object per comment; inline ones have path and line). Address each one. If one needs no code change, say so in your final message."
  fi

  if [ -z "$reason" ]; then
    rm -f "$STATE_DIR/pr-$pr.attempts"
    return 0
  fi

  attempts="$(cat "$STATE_DIR/pr-$pr.attempts" 2>/dev/null || echo 0)"
  if [ "$attempts" -ge "$MAX_FIX_ATTEMPTS" ]; then
    log "PR #$pr: still needs work after $attempts fix attempts; marking stuck"
    remove_label "$pr" "$LABEL_PR"
    add_label "$pr" "$LABEL_STUCK"
    remove_label "$n" "$LABEL_PR"
    add_label "$n" "$LABEL_STUCK"
    return 1
  fi
  echo $((attempts + 1)) >"$STATE_DIR/pr-$pr.attempts"

  log "PR #$pr (#$n): fixing (attempt $((attempts + 1))/$MAX_FIX_ATTEMPTS)"
  setup_worktree "$n" "$branch" || return 1
  # Pick up anything pushed to the branch from elsewhere.
  git -C "$wt" merge --quiet --ff-only "origin/$branch" || {
    log "  local branch diverged from origin/$branch; leaving it for a human"
    return 1
  }
  cp "$STATE_DIR/feedback/pr-$pr.jsonl" "$wt/.loop/feedback.jsonl"
  before="$(git -C "$wt" rev-parse HEAD)"

  run_claude fix "$n" "$wt" "$(render "$LOOP_DIR/prompts/fix.md" "$n" "$branch" "$reason")" || return 1
  scrub_attribution "$wt" "origin/$branch" "$branch"

  if [ "$(git -C "$wt" rev-parse HEAD)" = "$before" ]; then
    log "  no code changes"
  else
    if ! run_gate "$wt"; then
      log "  gate failed after the fix; not pushing"
      return 1
    fi
    git_locked -C "$wt" push --quiet origin "$branch" || return 1
    log "  pushed fix to PR #$pr"
  fi
  if [ -n "$newest" ]; then echo "$newest" >"$STATE_DIR/pr-$pr.seen"; fi
}

tend_prs() {
  local pr branch
  cleanup_finished
  while IFS=$'\t' read -r pr branch; do
    [ -n "$pr" ] || continue
    tend_pr "$pr" "$branch" || log "PR #$pr: tending failed; will retry next tick"
  done < <(gh pr list --repo "$REPO" --state open --label "$LABEL_PR" --limit 100 \
    --json number,headRefName --jq '.[] | [.number, .headRefName] | @tsv')
}

# --- main ------------------------------------------------------------------

dry_run() {
  local table next
  table="$(issue_table)"
  log "open '$ISSUE_LABEL' issues in $REPO:"
  awk -F'\t' '{ printf "  #%-4s %-28s %s\n", $1, $2, $3 }' <<<"$table"
  next="$(awk -F'\t' '$2 == "ready" { print $1; exit }' <<<"$table")"
  if [ -n "$next" ]; then log "would pick #$next"; else log "nothing ready: waiting on merges"; fi
  log "open agent PRs:"
  gh pr list --repo "$REPO" --state open --label "$LABEL_PR" --json number,title \
    --jq '.[] | "  #\(.number) \(.title)"'
}

on_interrupt() {
  if [ -n "$CURRENT_ISSUE" ]; then
    log "interrupted; releasing #$CURRENT_ISSUE (worktree kept, the next run resumes it)"
    remove_label "$CURRENT_ISSUE" "$LABEL_WIP"
  fi
  release_my_locks
  exit 130
}

main() {
  local done_count=0 stuck_streak=0 n exclude
  mkdir -p "$LOG_DIR"
  setup_toolchain
  cd "$REPO_ROOT"

  if $PREFLIGHT_ONLY; then preflight; exit $?; fi
  if $DRY_RUN; then
    REPO="$(repo_on_github)" || die "gh cannot see this repo; run: gh auth login"
    dry_run
    exit 0
  fi
  preflight || die "preflight failed; fix the items above (see tooling/agent-loop/README.md)"
  REPO="$(repo_on_github)"
  ensure_labels

  # Keep loop files out of git in every worktree, even before .gitignore has them.
  exclude="$(git rev-parse --path-format=absolute --git-common-dir)/info/exclude"
  grep -qxF '.loop/' "$exclude" 2>/dev/null || echo '.loop/' >>"$exclude"

  trap on_interrupt INT TERM
  trap release_my_locks EXIT
  if $WORKER; then
    log "agent loop WORKER (pid $$) on $REPO: implements only, no PR tending (budget \$$BUDGET per session; Ctrl+C to stop)"
  else
    log "agent loop on $REPO (budget \$$BUDGET per session; Ctrl+C to stop)"
  fi
  while true; do
    if ! $WORKER; then tend_prs; fi
    n="$(claim_issue)"
    if [ -z "$n" ]; then
      if $ONCE; then
        log "nothing ready"
        break
      fi
      log "nothing ready (waiting on merges); next check in ${POLL}s"
      sleep "$POLL"
      continue
    fi
    if work_issue "$n"; then stuck_streak=0; else stuck_streak=$((stuck_streak + 1)); fi
    done_count=$((done_count + 1))
    if [ "$stuck_streak" -ge "$MAX_STUCK_STREAK" ]; then
      die "$stuck_streak issues in a row got stuck; stopping so a human can look"
    fi
    if [ "$MAX_ISSUES" -gt 0 ] && [ "$done_count" -ge "$MAX_ISSUES" ]; then
      log "reached --max-issues $MAX_ISSUES"
      break
    fi
    if $ONCE; then break; fi
  done
}

main
