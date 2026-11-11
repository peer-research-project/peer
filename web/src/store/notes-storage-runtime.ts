import { newId } from "@/lib/notes/blocks";
import { createAtomicNotesStorage } from "./notes-atomic-storage";

export type NotesStorageStatus = "loading" | "ready" | "pending" | "error" | "conflict";
export type NotesStorageView = { status: NotesStorageStatus; conflictId?: string; remoteChange: boolean; drafts: number };
let view: NotesStorageView = { status: "loading", remoteChange: false, drafts: 0 };
const listeners = new Set<() => void>();
let journal: ReturnType<typeof createAtomicNotesStorage> | undefined;
let installed = false;
const drafts = new Map<string, unknown>();
export function trackUnsavedDraft(id: string, value: unknown) { drafts.set(id, value); publish({ drafts: drafts.size }); }
export function clearUnsavedDraft(id: string) { if (drafts.delete(id)) publish({ drafts: drafts.size }); }
export function downloadUnsavedDrafts() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(Object.fromEntries(drafts), null, 2)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = "peer-unsaved-drafts.json"; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function publish(patch: Partial<NotesStorageView>) {
  if (view.status === "error" && drafts.size && patch.status && patch.status !== "error") patch = { ...patch, status: "error" };
  view = { ...view, ...patch };
  listeners.forEach((listener) => listener());
}
export const subscribeNotesStorage = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };
export const notesStorageSnapshot = () => view;
const serverView: NotesStorageView = { status: "loading", remoteChange: false, drafts: 0 };
export const notesStorageServerSnapshot = () => serverView;

export function getNotesJournal(migrate: (state: unknown, version: number) => unknown) {
  if (journal) return journal;
  try {
    journal = createAtomicNotesStorage({
      storage: window.localStorage,
      indexedDB: window.indexedDB,
      writer: newId(),
      migrate,
      status: (status, conflictId) => publish({ status, ...(conflictId ? { conflictId } : {}) }),
    });
    if (!installed) {
      installed = true;
      window.addEventListener("beforeunload", (event) => {
        if (drafts.size) { event.preventDefault(); event.returnValue = ""; }
      });
      window.addEventListener("storage", (event) => {
        if (event.storageArea !== window.localStorage) return;
        if (event.key === "peer-notes") {
          try { journal?.observeLegacy(event.newValue); } catch { publish({ status: "error" }); }
        } else if (event.key?.startsWith("peer-notes:wal:v1:")) {
          publish({ remoteChange: true });
        }
      });
    }
    return journal;
  } catch (error) {
    publish({ status: "error" });
    throw error;
  }
}
export function downloadNotesRecovery() {
  try {
    const data: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === "peer-notes" || key?.startsWith("peer-notes:wal:v1:")) {
        const value = localStorage.getItem(key);
        if (value !== null) data[key] = value;
      }
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "peer-notes-recovery.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch { publish({ status: "error" }); }
}
export function retryNotesStorage() { window.dispatchEvent(new Event("peer:retry-notes")); if (!drafts.size) journal?.retryPending(); }
