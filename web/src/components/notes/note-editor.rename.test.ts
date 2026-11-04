import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { block } from "@/lib/notes/blocks";
import { blankNote } from "@/lib/notes/templates";
import { useNotesStore } from "@/store/notes";
import { adoptStoredTitle } from "./note-editor";

// D-B9-1 (RUBRIC Theme B unit 9): with note N open in the editor, renaming N from the notes rail's "Manage" menu wrote
// the new title to the store, but the editor kept the title it was opened with — its title field (and the tab's title)
// still said the old one, and the next body edit saved the editor's whole doc, old title included, so the rename was
// silently lost. Rule: the open editor adopts a title the store gained from outside (the rail's Rename) unless the
// reader has an unsaved edit of the title field of their own, which still wins. No DOM in this runtime: the rule is a
// pure function, the sequence is replayed against the real store, and the wiring is read from the source.

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const editor = read("src/components/notes/note-editor.tsx");

type Doc = Parameters<typeof adoptStoredTitle>[0];

describe("adoptStoredTitle — the editor's title after the store's title changes", () => {
  const doc: Doc = { title: "Old title", blocks: [block("text", "body")], sources: {} };

  it("adopts a title renamed from outside when the title field holds no edit of its own", () => {
    const next = adoptStoredTitle(doc, "Old title", "Renamed title");
    expect(next.title).toBe("Renamed title");
    expect(next.blocks).toBe(doc.blocks);
    expect(next.sources).toBe(doc.sources);
  });

  it("keeps the reader's own unsaved title edit over the stored one", () => {
    const typing: Doc = { ...doc, title: "Old title, still typing" };
    expect(adoptStoredTitle(typing, "Old title", "Renamed title")).toBe(typing);
  });

  it("changes nothing when the store's title did not change, or already matches the doc", () => {
    expect(adoptStoredTitle(doc, "Old title", "Old title")).toBe(doc);
    const saved: Doc = { ...doc, title: "Typed and saved" };
    expect(adoptStoredTitle(saved, "Old title", "Typed and saved")).toBe(saved);
  });
});

describe("D-B9-1 — rename from the rail while the note is open, then a body edit", () => {
  beforeEach(() => useNotesStore.setState({ notes: {} }));

  it("keeps the renamed title: the editor shows it and the body edit's save does not write the old one back", () => {
    const store = () => useNotesStore.getState();
    const note = { ...blankNote(), title: "Canopy test note alpha", blocks: [block("text", "first words")] };
    store().add(note);

    // The editor opens N: its doc is seeded from the stored note, and it has seen the stored title.
    let doc: Doc = { title: note.title, blocks: note.blocks, sources: note.sources };
    let seen = store().notes[note.id].title;

    // The rail's RenameRow: `saveNote(note.id, { title })`.
    store().save(note.id, { title: "Renamed gamma note" });

    // The editor re-renders with the stored note and adopts the outside title.
    const stored = store().notes[note.id].title;
    doc = adoptStoredTitle(doc, seen, stored);
    seen = stored;
    expect(doc.title).toBe("Renamed gamma note");

    // Any body edit, then the editor's autosave: `saveNote(note.id, docRef.current)` — the whole doc.
    doc = { ...doc, blocks: doc.blocks.map((b) => ({ ...b, text: `${b.text} more` })) };
    store().save(note.id, doc);

    const kept = store().notes[note.id];
    expect(kept.title).toBe("Renamed gamma note");
    expect(kept.blocks[0].text).toBe("first words more");
  });

  it("the editor is wired to the rule: an effect on the note's stored title commits the adopted doc", () => {
    expect(editor).toMatch(/const seenTitle = useRef\(note\.title\);/);
    expect(editor).toMatch(/adoptStoredTitle\(docRef\.current, seenTitle\.current, note\.title\)/);
    expect(editor).toMatch(/\}, \[note\.title, commit\]\);/);
  });
});
