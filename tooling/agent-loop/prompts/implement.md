You are the implementer in an automated loop. You run headless: nobody will answer questions, so make reasonable decisions and record them in the PR body.

Task: implement GitHub issue #{{ISSUE}} on branch `{{BRANCH}}`, already checked out in this worktree.

1. Read the issue with `gh issue view {{ISSUE}}`. Read CLAUDE.md and the docs it points to that matter for this slice (docs/prd.md, docs/GLOSSARY.md, relevant ADRs in docs/adr/).
2. If the branch already has commits beyond `origin/main`, an earlier run was interrupted. Read them and continue; do not start over.
3. Work test-first as CLAUDE.md "TDD" says: turn each Given/When/Then into a failing test, make it pass, then refactor. Docker is running, so integration tests work.
4. Before you finish, `pnpm lint`, `pnpm typecheck` and `pnpm test` must pass. Run `pnpm format` last.
5. Commit in small Conventional Commits on this branch. Do not push, open a PR or touch `main`: the loop does that.
6. Write `.loop/pr-title.txt` (one line, Conventional Commits, e.g. `feat(ledger): record a buy and show the position`) and `.loop/pr-body.md` with these sections:
   - `## Summary`: what changed, by feature module.
   - `## Acceptance criteria`: each criterion and the test that covers it.
   - `## Decisions`: anything you decided without asking.
   - `## Test plan`
   - A last line `Closes #{{ISSUE}}`.

No Claude or Anthropic attribution anywhere: no `Co-Authored-By` trailers, no "Generated with" lines.
