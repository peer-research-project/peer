# C checkpoint W3-B9-RENAME (Group 2, B+C) — 2026-11-04

Defect D-B9-1 (RUBRIC Theme B unit 9, misleading 0.5): renaming the open note from the notes rail's Manage (···) → Rename
did not reach the open editor; its title field and `document.title` kept the old title, and the next body edit saved the
old title back, so the rename was silently lost.

Base: detached worktree `C:/Users/wbc13/AppData/Local/Temp/peer-wt-w3` at `71d0c3f8`.

## B — cause (file:line at 71d0c3f8)

- `web/src/components/notes/note-editor.tsx:662-672` — the editor seeds its `doc` (title, blocks, sources) from the
  `note` prop once, at mount, and never reads `note.title` again.
- `web/src/app/notes/[id]/page.tsx:32` — the page keys `NoteEditor` by `note.id`, so a rename (same id) re-renders the
  editor with the new `note` prop but does not remount it; the stale `doc.title` survives.
- `web/src/components/notes/notes-rail.tsx:288` — Rename writes only the store: `saveNote(note.id, { title })`.
- `web/src/components/notes/note-editor.tsx:737-738` — any later doc change autosaves the editor's WHOLE doc,
  `saveNote(note.id, docRef.current)`, so the stale title overwrites the renamed one (`store/notes.ts:437` spreads the
  patch over the note).
- `title-once.tsx` is not involved: it only chooses which block to hide, once, at open.

## B — candidate rules

1. Editor adopts an outside title change for the open note, unless the title field holds an unsaved edit of the
   reader's own. Cost: one pure function + one effect (~19 lines, one file); also fixes the stale title field and tab
   title. Risk: a rename made while the reader has an unsaved title edit loses to the reader's typing (intended: local
   typing wins).
2. Editor saves only the fields it changed (patch vs a last-saved baseline). Cost: baseline bookkeeping across the
   timer save and the pagehide/unmount flush; fixes the data loss but leaves the title field and `document.title`
   showing the old title (step 3 of the repro stays misleading), and a later title edit starts from the stale text.
3. Rail's Rename routes through the open editor (event/bus or shared ref) instead of the store. Cost: new coupling
   between rail and editor, does not cover any other writer of the title (e.g. another tab), largest change.

Picked: rule 1 (brief's first preference; smallest change that fixes both the display and the save).

## C — change

- `web/src/components/notes/note-editor.tsx:640` — `export function adoptStoredTitle(doc, seen, stored)`: returns
  `{ ...doc, title: stored }` when the stored title changed (`stored !== seen`), the doc does not already have it, and
  the doc's title is still the one last seen (no unsaved local edit); else the same doc.
- `web/src/components/notes/note-editor.tsx:774-779` — `seenTitle = useRef(note.title)` and an effect on
  `[note.title, commit]` that commits the adopted doc and moves `seenTitle`. The editor's own saves also move
  `note.title`; there `doc.title === stored` (or a newer local edit) so nothing changes. Commit goes through the normal
  path, so the field, `document.title`, `onDoc` and the autosave all see the renamed title.

## Tests

New `web/src/components/notes/note-editor.rename.test.ts` (5 tests):
- `adoptStoredTitle` — adopts an outside rename; keeps the reader's unsaved title edit; no change when nothing moved.
- `D-B9-1 — rename from the rail while the note is open, then a body edit` › keeps the renamed title — replays the
  exact sequence against the real `useNotesStore`: open (seed doc), rail Rename `save(id, { title })`, editor adopts,
  body edit, autosave of the whole doc → stored title is still `Renamed gamma note`, body edit kept.
- wiring read from the source (the `seenTitle` ref, the `adoptStoredTitle` call, the `[note.title, commit]` effect).

Results (from `web/` in the worktree):
- Before the fix: 5/5 failed (`TypeError: adoptStoredTitle is not a function`; wiring regex absent).
- After: `npx vitest run src/components/notes/note-editor.rename.test.ts` 5/5 passed.
- `npx vitest run src/components/notes src/store`: 70 files, 1303 tests passed.
- `npx tsc --noEmit --incremental false`: exit 0. `npx eslint` on both touched files: exit 0.

## Mutation (one)

- Mutated `  return { ...doc, title: stored };` → `  return doc;` in `adoptStoredTitle`.
- New test red: 2 failed / 3 passed — `expected 'Old title' to be 'Renamed title'` and the sequence test
  `expected 'Canopy test note alpha' to be 'Renamed gamma note'` (exactly the reported loss).
- Restored from a byte copy: sha256 before = after =
  `2c334c108384798a2d2aa108fca6a0a956430d6b4016c2b8beba784cb9aa5e0d`; test back to 5/5; tsc exit 0.

## Not verified here

- No browser run (port 3000 belongs to the manager's test server). The manager should re-run the repro at
  `/notes/<id>`: rail Rename on the open note → title field and tab title update at once → a body edit keeps the new
  title in the rail after reload. Also worth one check: Rename while the title field has unsaved typing keeps the typing.

## Addendum — manager's mutation gap (2026-11-04)

The manager replaced `    if (next !== docRef.current) commit(next);` with `    void next;` and all 5 tests still passed.
The old wiring test only searched the whole file for the `adoptStoredTitle(...)` call and the dependency list, so
nothing checked that the effect actually commits the adopted doc.

Fix (test only, `note-editor.rename.test.ts`): the wiring test now cuts out the effect itself. It runs from
`const seenTitle = useRef(note.title);` to the first `}, [note.title, commit]);` after it. Inside that block it asserts:
`useEffect(() => {`, `const next = adoptStoredTitle(docRef.current, seenTitle.current, note.title);`,
`seenTitle.current = note.title;` and `if (next !== docRef.current) commit(next);`. `note-editor.tsx` is unchanged.

Mutations (each restored from a byte copy, sha256 of `note-editor.tsx` before = after every restore =
`2c334c108384798a2d2aa108fca6a0a956430d6b4016c2b8beba784cb9aa5e0d`):
- M1 (manager's exact one): `commit(next)` line → `    void next;` — red, 1 failed / 4 passed
  (`expected 'const seenTitle = useRef(note.title);…' to match /if \(next !== docRef\.current\) commi…/`).
- M2: delete `    seenTitle.current = note.title;` — red, 1 failed / 4 passed
  (`… to match /seenTitle\.current = note\.title;/`).

After restore: the new test passed 5/5 in 3 runs. `src/components/notes` + `src/store` passed (70 files, 1303 tests).
`tsc --noEmit --incremental false` exited 0, and eslint on both files exited 0.

Limit: with no DOM test runtime (no jsdom/happy-dom/testing-library, no new dependencies allowed), the wiring is
guarded by reading the source text, not by running the effect. A browser re-run of the repro is still the real check.
