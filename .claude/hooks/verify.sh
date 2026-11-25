#!/usr/bin/env bash
# Stop / SubagentStop hook (.claude/settings.json). When there are uncommitted
# changes or commits not yet on main, it blocks "done" until lint, typecheck
# and the Docker-free unit tests pass. Exit 2 sends stderr back to
# the agent so it keeps working. Emergency bypass: disable it in /hooks.
set -uo pipefail

CHECKS=(lint typecheck test:unit)
MAX_BLOCKS=3
TAIL_LINES=80

input="$(cat)"

# Hook input is JSON; read the two fields we need without requiring jq.
stop_hook_active=false
if grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true' <<<"$input"; then
  stop_hook_active=true
fi
cwd="$(sed -nE 's/.*"cwd"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/p' <<<"$input" | head -n 1)"
[ -n "$cwd" ] && [ -d "$cwd" ] || cwd="$PWD"

repo="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$repo" || exit 0

# Commits on HEAD that main does not have yet. Implementers commit before they
# stop, so a clean tree alone does not mean there is nothing to verify.
commits_ahead() {
  local base
  for base in origin/main main; do
    if git rev-parse --verify --quiet "$base^{commit}" >/dev/null; then
      git rev-list --count "$base..HEAD" 2>/dev/null || echo 0
      return
    fi
  done
  echo 0
}

# No uncommitted changes and nothing ahead of main (a chat-only turn): skip.
if [ -z "$(git status --porcelain)" ] && [ "$(commits_ahead)" -eq 0 ]; then
  exit 0
fi

# State files live in the git dir: it is per worktree, so agents in separate
# worktrees keep separate state, and nothing lands in the working tree.
git_dir="$(git rev-parse --absolute-git-dir)"
counter="$git_dir/claude-verify-blocks"
passed="$git_dir/claude-verify-passed"

# Hash of everything the checks read: HEAD, uncommitted changes and untracked
# files. Read-only (hash-object without -w writes nothing).
fingerprint() {
  local untracked
  untracked="$(git -c core.quotePath=false ls-files --others --exclude-standard)"
  {
    git rev-parse HEAD
    git diff HEAD --binary
    printf '%s\n' "$untracked"
    [ -n "$untracked" ] && git hash-object --stdin-paths <<<"$untracked"
  } 2>/dev/null | git hash-object --stdin
}

# Same state as the last passing run (a chat-only turn on a feature branch, or a
# branch whose squash-merged commits never reach main): skip.
state="$(fingerprint)"
if [ -f "$passed" ] && [ "$(cat "$passed" 2>/dev/null)" = "$state" ]; then
  exit 0
fi

blocks=0
if [ "$stop_hook_active" = true ] && [ -f "$counter" ]; then
  blocks="$(cat "$counter" 2>/dev/null)"
  [[ "$blocks" =~ ^[0-9]+$ ]] || blocks=0
fi

# pnpm if it is on PATH, else through corepack (package.json pins the version).
if command -v pnpm >/dev/null 2>&1; then
  pnpm=(pnpm)
else
  pnpm=(corepack pnpm)
  export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
fi

output="$(mktemp)"
trap 'rm -f "$output"' EXIT

failed=""
for check in "${CHECKS[@]}"; do
  if ! "${pnpm[@]}" "$check" >>"$output" 2>&1; then
    failed="$check"
    break
  fi
done

if [ -z "$failed" ]; then
  rm -f "$counter"
  echo "$state" >"$passed"
  exit 0
fi

rm -f "$passed"

if [ "$blocks" -ge "$MAX_BLOCKS" ]; then
  rm -f "$counter"
  warning="Warning: verify hook gave up after blocking $MAX_BLOCKS times in a row; 'pnpm $failed' still fails. Fix it before handing off."
  {
    echo "$warning Last $TAIL_LINES lines:"
    tail -n "$TAIL_LINES" "$output"
  } >&2
  printf '{"systemMessage": "%s"}\n' "$warning"
  exit 0
fi

echo $((blocks + 1)) >"$counter"
{
  echo "Verification failed: 'pnpm $failed' (the hook runs pnpm ${CHECKS[*]}). Last $TAIL_LINES lines:"
  tail -n "$TAIL_LINES" "$output"
} >&2
exit 2
