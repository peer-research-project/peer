# Brief W3-B9-RENAME (Group 2, B+C: investigate then fix one defect) — 2026-11-04

Repo: C:/I/Personal/Github - start up project/Peer, branch fixing-bugs-on-uploading-pdf-and-abstract-reading, HEAD (check `git rev-parse HEAD`, expected 71d0c3f8).
Work ONLY in your own detached worktree: `git -C "<repo>" worktree add --detach C:/Users/wbc13/AppData/Local/Temp/peer-wt-w3 HEAD`. For node_modules create a junction: `cmd /c mklink /J C:\Users\wbc13\AppData\Local\Temp\peer-wt-w3\web\node_modules "C:\I\Personal\Github - start up project\Peer\web\node_modules"`. Commit in that worktree with author `peter14531453 <274981268+peter14531453@users.noreply.github.com>` and a trailer line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. NEVER push, branch, or touch the main checkout. Do not add dependencies. Do not run a dev server on port 3000 (the manager's test server is there).

Defect D-B9-1 (RUBRIC Theme B unit 9, cost misleading 0.5), reproduced by the manager in the browser:
1. Open note N in the editor (/notes/<id>).
2. In the left notes rail, open N's "Manage" (···) menu → Rename → type a new title → Enter. The rail shows the new title.
3. The open editor's title box still shows the OLD title (document.title too).
4. Type any character in N's body. The note is saved with the OLD title: the rail reverts, the rename is silently lost.

Files likely involved: web/src/components/notes/notes-rail.tsx (RenameRow / setRenaming), web/src/components/notes/note-editor.tsx (title state / save), the notes store (find it, e.g. useNotesStore), title-once.tsx (TitleOnce).
B part: find the exact cause with file:line; give 3 candidate rules with cost; pick one (prefer: the editor adopts external title changes for the open note without clobbering in-progress local typing, OR saves patch only changed fields).
C part: implement the chosen rule with the smallest change; add a test that reproduces the exact sequence (rename via store/rail while the editor is open, then a body edit → title must remain the renamed one) that FAILS before your fix and PASSES after; run that test, the notes test files, `npx tsc --noEmit --incremental false` and `npx eslint <touched files>` from web/ in your worktree. Perform ONE mutation (revert your fix line), show the new test goes red, restore byte-identical (hash before = after). Never delete/skip/weaken tests.
Output: commit(s) in the worktree + checkpoint docs/handoff/upload-abstract/checkpoints/C-w3-b9-rename.md committed there. Final reply: one paragraph with cause, rule, commit SHA(s), test names and results, mutation evidence.
