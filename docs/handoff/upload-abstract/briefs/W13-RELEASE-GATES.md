# Brief W13-RELEASE-GATES (Group 1, A: release gates at the current head) — 2026-11-04

Repo: C:/I/Personal/Github - start up project/Peer, branch fixing-bugs-on-uploading-pdf-and-abstract-reading, HEAD 0a156602 (check with `git rev-parse HEAD` in the main checkout; use exactly that SHA).
Own detached worktree at that SHA: `git -C "<repo>" worktree add --detach C:/Users/wbc13/AppData/Local/Temp/peer-wt-w13 <SHA>`. Turbopack refuses a node_modules junction for `next build`, so COPY node_modules with robocopy (`robocopy "<main>\web\node_modules" "<wt>\web\node_modules" /E /NFL /NDL /NJH /NJS /MT:16`), and never create links. Measure only: no product code changes, no commits to the branch, no push/branch. Never load any env file (no web/.env.local exists in the worktree — keep it that way). Never use ports 3000/3100/3110.

Run from <wt>/web, saving each full output and exit code to C:/Users/wbc13/AppData/Local/Temp/peer-claude-w13/:
1. `npx vitest run` (full suite). If any test fails, rerun that file alone 2x and report whether it is a parallel-timeout flake (pass alone) or a real failure (fail alone). Report file/test counts.
2. `npx tsc --noEmit --incremental false` → exit code and error count.
3. `npx eslint .` → exit code, error count, warning count (the earlier baseline was 0 errors / 138 warnings; report the new warning count and list any NEW warnings vs that baseline only if you can determine them cheaply).
4. `npm run build` (production next build) → exit code, route count, any warnings (expect 0 "whole project traced" warnings after R-H3).
5. Optional quick check: grep the built `.next/static` for the production Supabase ref `gdakokshfjqljddlrkrh` — must be 0 (no env was loaded, so expect 0 for both refs).
Then delete the worktree's node_modules copy (it is a real directory — verify with `(Get-Item -Force path).LinkType` being empty BEFORE deleting) and `git worktree remove --force` the worktree.
Output: checkpoint text in your final reply only (do not commit): HEAD SHA, each gate's exit code and counts, log paths, flakes vs real failures. One paragraph + a table.
