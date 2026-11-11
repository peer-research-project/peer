import { newId } from "@/lib/notes/blocks";
import type { Note } from "@/lib/notes/types";

type Notes = Record<string, Note>;
type Change = { value: Note | null; base: string | null; changedAt: number };
type Operation = { writer: string; seq: number; changes: Record<string, Change>; legacyRaw?: string };
type RecordEntry = { id: string; value: Note | null; revision: string; writer: string; conflictOrigin?: { id: string; writer: string } };
type Meta = { key: string; value: unknown };
const WAL = "peer-notes:wal:v1:";
const DB = "peer-notes-atomic-v1";
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error ?? new Error("Notes transaction aborted")); tx.onerror = () => {}; });
}

export function createAtomicNotesStorage(options: {
  storage: Storage;
  indexedDB: IDBFactory;
  writer: string;
  migrate: (state: unknown, version: number) => unknown;
  status: (status: "ready" | "pending" | "error" | "conflict", conflictId?: string) => void;
}) {
  const { storage, indexedDB, writer, migrate, status } = options;
  let dbPromise: Promise<IDBDatabase> | undefined;
  let baseline: Notes = {};
  let revisions: Record<string, string> = {};
  let pending: Record<string, Change> = {};
  let seq = 0;
  let ready = false;
  let queue = Promise.resolve();
  let pendingWrites = 0;
  const failedKeys = new Set<string>();
  const settleStatus = () => status(pendingWrites ? "pending" : failedKeys.size ? "error" : hasConflict ? "conflict" : "ready", lastConflict);
  let hasConflict = false;
  let lastConflict: string | undefined;
  function open(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains("notes")) r.result.createObjectStore("notes", { keyPath: "id" });
        if (!r.result.objectStoreNames.contains("meta")) r.result.createObjectStore("meta", { keyPath: "key" });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error("Notes database blocked"));
    });
    void dbPromise.catch(() => { dbPromise = undefined; });
    return dbPromise;
  }
  async function migrateLegacy(db: IDBDatabase, raw = storage.getItem("peer-notes"), eventId?: string): Promise<boolean> {
    const tx = db.transaction(["notes", "meta"], "readwrite");
    const done = finished(tx);
    const meta = tx.objectStore("meta");
    let conflicted = false;
    try {
    const original = await request(meta.get("legacy-original")) as Meta | undefined;
    const previous = await request(meta.get("legacy-current")) as Meta | undefined;
    const processed = eventId ? await request(meta.get(`legacy-event:${eventId}`)) : undefined;
    if (raw !== null && !processed && (eventId || previous?.value !== raw)) {
      const readLegacy = (source: string): Notes => {
        const parsed = JSON.parse(source) as { state?: unknown; version?: number };
        return (migrate(parsed.state, parsed.version ?? 0) as { notes?: Notes } | undefined)?.notes ?? {};
      };
      const old = typeof previous?.value === "string" ? readLegacy(previous.value) : {};
      const incoming = readLegacy(raw);
      if (!original) await request(meta.put({ key: "legacy-original", value: raw }));
      for (const [id, value] of Object.entries(incoming)) {
        if (same(old[id], value)) continue;
        const table = tx.objectStore("notes");
        const current = await request(table.get(id)) as RecordEntry | undefined;
        if (!current) {
          await request(table.put({ id, value, revision: `legacy:${id}:${Date.now()}`, writer: "legacy" } satisfies RecordEntry));
        } else if (!same(current.value, value)) {
          // A legacy page writes whole snapshots; missing or changed values
          // may be stale. Never put them over an existing note.
          const conflictId = `conflict:${encodeURIComponent(id)}:legacy:${eventId ?? newId()}`;
          await request(table.put({ id: conflictId, value: { ...value, id: conflictId, title: `${value.title || "Untitled"} (conflict copy)` }, revision: `legacy:${id}:${Date.now()}`, writer: "legacy" } satisfies RecordEntry));
          conflicted = true;
          lastConflict = conflictId;
        }
      }
      // A missing entry in an old whole-store snapshot may be an unseen note,
      // not a deletion. Keep it until the reader resolves it explicitly.
      if (Object.keys(old).some((id) => !incoming[id])) conflicted = true;
      await request(meta.put({ key: "legacy-current", value: raw }));
      if (eventId) await request(meta.put({ key: `legacy-event:${eventId}`, value: true }));
    }
    await done;
    return conflicted;
    } catch (error) {
      try { tx.abort(); } catch { /* already complete */ }
      await done.catch(() => {});
      throw error;
    }
  }
  async function apply(db: IDBDatabase, key: string, op: Operation): Promise<boolean> {
    const legacyConflict = typeof op.legacyRaw === "string" ? await migrateLegacy(db, op.legacyRaw, op.writer) : false;
    const tx = db.transaction(["notes", "meta"], "readwrite");
    const done = finished(tx);
    const meta = tx.objectStore("meta");
    let conflicted = legacyConflict;
    try {
    const seen = await request(meta.get(`writer:${op.writer}`)) as Meta | undefined;
    const watermark = typeof seen?.value === "number" ? seen.value : 0;
    if (op.seq > watermark) {
      for (const [id, change] of Object.entries(op.changes)) {
        if (change.changedAt <= watermark) continue;
        const table = tx.objectStore("notes");
        const current = await request(table.get(id)) as RecordEntry | undefined;
        const revision = `${op.writer}:${op.seq}:${id}`;
        const direct = !current || current.revision === change.base || current.writer === op.writer;
        if (direct) {
          await request(table.put({ id, value: change.value, revision, writer: op.writer } satisfies RecordEntry));
        } else if (change.value === null) {
          if (current.value) {
            const baseId = `conflict:${encodeURIComponent(id)}:${current.writer}`;
            const prior = await request(table.get(baseId)) as RecordEntry | undefined;
            const conflictId = prior && (prior.conflictOrigin?.id !== id || prior.conflictOrigin?.writer !== current.writer) ? `${baseId}:${op.writer}:${op.seq}` : baseId;
            await request(table.put({ id: conflictId, value: { ...current.value, id: conflictId, title: `${current.value.title || "Untitled"} (conflict copy)` }, revision, writer: current.writer, conflictOrigin: { id, writer: current.writer } } satisfies RecordEntry));
            conflicted = true;
            lastConflict = conflictId;
          }
          await request(table.put({ id, value: null, revision, writer: op.writer } satisfies RecordEntry));
        } else {
          const baseId = `conflict:${encodeURIComponent(id)}:${op.writer}`;
          const prior = await request(table.get(baseId)) as RecordEntry | undefined;
          const conflictId = prior && (prior.conflictOrigin?.id !== id || prior.conflictOrigin?.writer !== op.writer) ? `${baseId}:${op.seq}` : baseId;
          await request(table.put({ id: conflictId, value: { ...change.value, id: conflictId, title: `${change.value.title || "Untitled"} (conflict copy)` }, revision, writer: op.writer, conflictOrigin: { id, writer: op.writer } } satisfies RecordEntry));
          conflicted = true;
          lastConflict = conflictId;
        }
      }
      await request(meta.put({ key: `writer:${op.writer}`, value: op.seq }));
    }
    await done;
    } catch (error) {
      try { tx.abort(); } catch { /* already complete */ }
      await done.catch(() => {});
      throw error;
    }
    storage.removeItem(key);
    return conflicted;
  }
  async function replay(db: IDBDatabase): Promise<boolean> {
    let conflicted = false;
    const entries: Array<{ key: string; op: Operation }> = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith(WAL)) continue;
      const raw = storage.getItem(key);
      if (!raw) continue;
      const op = JSON.parse(raw) as Operation;
      if (!op || typeof op.writer !== "string" || !Number.isSafeInteger(op.seq) || !op.changes || typeof op.changes !== "object") throw new Error("Invalid notes recovery record");
      entries.push({ key, op });
    }
    entries.sort((a, b) => a.op.writer.localeCompare(b.op.writer) || a.op.seq - b.op.seq);
    for (const item of entries) conflicted = await apply(db, item.key, item.op) || conflicted;
    return conflicted;
  }
  return {
    async getItem(): Promise<string> {
      try {
        const db = await open(); const legacyConflict = await migrateLegacy(db); const walConflict = await replay(db);
        const tx = db.transaction("notes", "readonly"); const done = finished(tx);
        const records = await request(tx.objectStore("notes").getAll()) as RecordEntry[]; await done;
        const notes: Notes = {}; revisions = {};
        for (const r of records) { revisions[r.id] = r.revision; if (r.value) notes[r.id] = r.value; }
        baseline = notes; ready = true; hasConflict = legacyConflict || walConflict; status(hasConflict ? "conflict" : "ready", lastConflict);
        return JSON.stringify({ state: { notes }, version: 2 });
      } catch (error) { status("error"); throw error; }
    },
    setItem(_name: string, raw: string): void {
      if (!ready) { status("error"); throw new Error("Notes have not finished loading"); }
      const incoming = (JSON.parse(raw) as { state?: { notes?: Notes } }).state?.notes;
      if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) { status("error"); throw new Error("Invalid notes update"); }
      const changed = [...new Set([...Object.keys(baseline), ...Object.keys(incoming)])].filter((id) => !same(baseline[id], incoming[id]));
      if (!changed.length) return;
      const nextSeq = seq + 1;
      const next = { ...pending };
      for (const id of changed) next[id] = { value: incoming[id] ?? null, base: pending[id]?.base ?? revisions[id] ?? null, changedAt: nextSeq };
      const op = { writer, seq: nextSeq, changes: next };
      const key = `${WAL}${writer}:${nextSeq}`;
      try { storage.setItem(key, JSON.stringify(op)); } catch (error) { status("error"); throw error; }
      seq = nextSeq; pending = next; baseline = incoming; pendingWrites++; status("pending");
      queue = queue.catch(() => {}).then(async () => {
        const db = await open(); const conflicted = await apply(db, key, op);
        failedKeys.delete(key);
        for (const [id, change] of Object.entries(pending)) if (change.changedAt <= op.seq) delete pending[id];
        hasConflict ||= conflicted;
        pendingWrites--;
        settleStatus();
      }).catch(() => { pendingWrites--; failedKeys.add(key); status("error"); });
    },
    observeLegacy(raw: string | null): void {
      if (raw === null) { hasConflict = true; status("conflict"); return; }
      const eventWriter = `${writer}-legacy-${newId()}`;
      const op: Operation = { writer: eventWriter, seq: 1, changes: {}, legacyRaw: raw };
      const key = `${WAL}${eventWriter}:1`;
      try { storage.setItem(key, JSON.stringify(op)); } catch (error) { status("error"); throw error; }
      pendingWrites++; status("pending");
      queue = queue.catch(() => {}).then(async () => {
        const db = await open(); const conflicted = await apply(db, key, op); hasConflict ||= conflicted; failedKeys.delete(key);
        pendingWrites--; settleStatus();
      }).catch(() => { pendingWrites--; failedKeys.add(key); status("error"); });
    },
    retryPending(): void {
      const through = seq;
      pendingWrites++;
      status("pending");
      queue = queue.catch(() => {}).then(async () => {
        const db = await open();
        const conflicted = await replay(db);
        hasConflict ||= conflicted;
        for (const key of failedKeys) if (storage.getItem(key) === null) failedKeys.delete(key);
        for (const [id, change] of Object.entries(pending)) if (change.changedAt <= through) delete pending[id];
        pendingWrites--;
        settleStatus();
      }).catch(() => { pendingWrites--; status("error"); });
    },
    removeItem(): void { throw new Error("Clear individual notes instead"); },
    settled(): Promise<void> { return queue; },
  };
}
