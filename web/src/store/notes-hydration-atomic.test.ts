import { afterEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

function memory() {
  const data = new Map<string, string>();
  let fail = false;
  return {
    get length() { return data.size; }, key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { if (fail && key.includes(":wal:")) throw new Error("quota"); data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); }, clear: () => data.clear(),
    setFailure: (on: boolean) => { fail = on; },
  };
}
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
it("rejects writes while hydration is pending before changing in-memory notes", async () => {
  const storage = memory();
  vi.stubGlobal("window", { localStorage: storage, indexedDB: new IDBFactory(), addEventListener: () => {} });
  const { useNotesStore } = await import("./notes");
  const { blankNote } = await import("@/lib/notes/templates");
  const note = blankNote();
  expect(() => useNotesStore.getState().add(note)).toThrow("still loading");
  expect(useNotesStore.getState().notes).toEqual({});
  await useNotesStore.persist.rehydrate();
  useNotesStore.getState().add(note);
  expect(useNotesStore.getState().notes[note.id]).toEqual(note);
});
it("does not mutate Zustand when the synchronous recovery write fails", async () => {
  const storage = memory();
  vi.stubGlobal("window", { localStorage: storage, indexedDB: new IDBFactory(), addEventListener: () => {} });
  const { useNotesStore } = await import("./notes");
  const { blankNote } = await import("@/lib/notes/templates");
  await useNotesStore.persist.rehydrate();
  const note = blankNote();
  storage.setFailure(true);
  expect(() => useNotesStore.getState().add(note)).toThrow("quota");
  expect(useNotesStore.getState().notes).toEqual({});
  storage.setFailure(false);
  useNotesStore.getState().add(note);
  expect(useNotesStore.getState().notes[note.id]).toEqual(note);
});
