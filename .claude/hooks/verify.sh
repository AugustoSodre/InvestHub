#!/usr/bin/env bash
# Stop / SubagentStop hook (.claude/settings.json): blocks "done" until lint,
# typecheck and the Docker-free unit tests pass. Exit 2 sends stderr back to
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

# Nothing changed (a chat-only turn): nothing to verify.
[ -z "$(git status --porcelain)" ] && exit 0

# Consecutive-block counter. The git dir is per worktree, so agents in separate
# worktrees keep separate counts, and the file stays out of the working tree.
counter="$(git rev-parse --absolute-git-dir)/claude-verify-blocks"
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
  exit 0
fi

if [ "$blocks" -ge "$MAX_BLOCKS" ]; then
  rm -f "$counter"
  warning="Warning: verify hook gave up after blocking $MAX_BLOCKS times in a row; 'pnpm $failed' still fails. Fix it before handing off."
  echo "$warning" >&2
  printf '{"systemMessage": "%s"}\n' "$warning"
  exit 0
fi

echo $((blocks + 1)) >"$counter"
{
  echo "Verification failed: 'pnpm $failed' (the hook runs pnpm ${CHECKS[*]}). Last $TAIL_LINES lines:"
  tail -n "$TAIL_LINES" "$output"
} >&2
exit 2
