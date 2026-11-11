import { afterEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

it("does not claim success when retry still cannot persist a draft", async () => {
  const target = new EventTarget(); const data = new Map<string, string>(); let fail = true;
  const storage = {
    get length() { return data.size; }, key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { if (fail) throw new Error("quota"); data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); }, clear: () => data.clear(),
  };
  vi.stubGlobal("window", { localStorage: storage, indexedDB: new IDBFactory(), addEventListener: target.addEventListener.bind(target), dispatchEvent: target.dispatchEvent.bind(target) });
  const runtime = await import("./notes-storage-runtime");
  const journal = runtime.getNotesJournal((state) => state);
  await journal.getItem();
  const raw = JSON.stringify({ state: { notes: { n: { id: "n", title: "draft", blocks: [], sources: {}, createdAt: "", updatedAt: "" } } }, version: 2 });
  runtime.trackUnsavedDraft("editor:n:1", raw);
  const attempt = () => { try { journal.setItem("peer-notes", raw); runtime.clearUnsavedDraft("editor:n:1"); } catch {} };
  target.addEventListener("peer:retry-notes", attempt);
  attempt();
  expect(runtime.notesStorageSnapshot().status).toBe("error");
  runtime.retryNotesStorage();
  await journal.settled();
  expect(runtime.notesStorageSnapshot()).toMatchObject({ status: "error", drafts: 1 });
  fail = false;
  runtime.retryNotesStorage();
  await journal.settled();
  expect(runtime.notesStorageSnapshot()).toMatchObject({ status: "ready", drafts: 0 });
});
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
it("initializes and captures legacy changes without crypto.randomUUID", async () => {
  const target = new EventTarget(); const data = new Map<string, string>();
  const storage = {
    get length() { return data.size; }, key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); }, clear: () => data.clear(),
  };
  vi.stubGlobal("window", { localStorage: storage, indexedDB: new IDBFactory(), addEventListener: target.addEventListener.bind(target), dispatchEvent: target.dispatchEvent.bind(target) });
  vi.stubGlobal("crypto", undefined);
  const runtime = await import("./notes-storage-runtime");
  const journal = runtime.getNotesJournal((state) => state);
  await journal.getItem();
  journal.observeLegacy(JSON.stringify({ state: { notes: {} }, version: 2 }));
  await journal.settled();
  expect(runtime.notesStorageSnapshot().status).toBe("ready");
});
