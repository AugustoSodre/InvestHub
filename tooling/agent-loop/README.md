# Agent loop

`loop.sh` works through the GitHub issues unattended with headless Claude Code. One issue at a time:

1. **Tend open agent PRs.** Merge conflict, failing CI or new human review comments → a fix session, then push. Merged or closed PRs get their worktree removed.
2. **Pick** the lowest-numbered open `slice` issue with no `agent:*` label whose `Blocked by #N` issues are all closed.
3. **Implement** in its own worktree (`.claude/worktrees/loop-<n>`, branch `feat/<n>-<slug>`), test-first, from the issue's acceptance criteria.
4. **Gate**: the script itself runs `pnpm lint`, `pnpm typecheck`, `pnpm test`. On failure: one fix session.
5. **Review** in a separate session (Standards and Spec reviewers in parallel). `changes` → fix → gate → review again, up to 3 rounds.
6. **Open the PR** with `Closes #<n>`, labelled `agent:pr`.

It **never merges**. You merge, the merge closes the issue, and that unblocks the issues that depend on it. While it waits for you, it checks again every 10 minutes.

## Labels

| Label         | Meaning                                                                          |
| ------------- | -------------------------------------------------------------------------------- |
| `agent:wip`   | The loop is working on it. Also the lock: two loops never take the same issue.   |
| `agent:pr`    | PR open, waiting for you.                                                        |
| `agent:stuck` | The loop gave up (see the draft PR or `.loop/logs/`). Remove the label to retry. |

## Set up a machine

Linux or macOS. On Windows, only inside WSL2.

1. Install git, Docker (your user must run `docker` without sudo), the GitHub CLI, nvm with Node 22 (`nvm install 22`), and Claude Code (`curl -fsSL https://claude.ai/install.sh | bash`).
2. Log in once, interactively: `gh auth login`, then run `claude` and type `/login`. Set `git config --global user.name` and `user.email`.
3. Clone and install:
   ```sh
   git clone https://github.com/AugustoSodre/InvestHub && cd InvestHub
   corepack enable && corepack pnpm install
   ```
4. Check: `tooling/agent-loop/loop.sh --preflight` until every line says `ok`.

Run the loop on **one machine at a time**.

## Run

```sh
tooling/agent-loop/loop.sh --dry-run          # what it would pick, and why the rest wait
tooling/agent-loop/loop.sh --once             # one tick, to watch it the first time
tmux new -s loop 'tooling/agent-loop/loop.sh' # unattended; detach with Ctrl+B D
```

Flags: `--max-issues N`, `--poll SECONDS` (default 600), `--budget USD` per Claude session (default 15), `--model NAME`.

**Stop** with Ctrl+C. The current issue loses its `agent:wip` label and keeps its worktree; the next run resumes from the commits already there.

It stops on its own after 2 issues in a row get stuck.

## Files

- `settings.json`: permissions for the headless sessions. They can edit, run pnpm, git and read-only `gh`; they cannot push, open or merge PRs, call `gh api`, or read `.env`. The script does the pushing. Attribution is off.
- `prompts/`: one prompt per role (`implement`, `review`, `fix`). Rules live in `CLAUDE.md`, not here.
- `review-schema.json`: the reviewer's structured verdict.
- `.loop/` (git-ignored): `logs/` has one stream-json log per session; `pr-<n>.*` tracks seen comments and fix attempts.

Sessions use `DATABASE_URL` pointing at `investhub_dev`, never `investhub`.
