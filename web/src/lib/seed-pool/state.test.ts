import { describe, expect, it } from "vitest";
import { EMPTY_SEED_POOL, forgetSeed, nextLocalDate, setSeedPool, snapshotForDate, undoPending } from "./state";
import type { SeedPaper } from "./types";
const seed = (id: string): SeedPaper => ({ id, uploadId: `upload:${id}`, canonicalKey: `doi:${id}`, contentHash: id === "one" ? "a".repeat(64) : id === "two" ? "b".repeat(64) : "c".repeat(64), title: `Paper ${id}`, features: { topic: ["fictional topic"], object: [], method: [] } });
const edit = (state = EMPTY_SEED_POOL, changes: Partial<Parameters<typeof setSeedPool>[1]> = {}) => setSeedPool(state, { expectedRevision: state.revision, today: "2026-03-07", servedToday: false, version: "v1", seeds: [seed("one")], ...changes });
function success(result: ReturnType<typeof setSeedPool>) { if (!result.ok) throw new Error(result.error); return result.state; }
describe("seed pool local-day state", () => {
  it("activates the first collection today before delivery, but stages it after delivery", () => {
    expect(snapshotForDate(success(edit()), "2026-03-07")?.version).toBe("v1");
    const delivered = success(edit(EMPTY_SEED_POOL, { servedToday: true }));
    expect(snapshotForDate(delivered, "2026-03-07")).toBeNull();
    expect(snapshotForDate(delivered, "2026-03-08")?.version).toBe("v1");
  });
  it("keeps today frozen, returns latest future edit, and undo restores active", () => {
    const first = success(edit());
    const next = success(edit(first, { version: "v2", seeds: [seed("two")] }));
    const latest = success(edit(next, { version: "v3", seeds: [seed("three")] }));
    expect(snapshotForDate(latest, "2026-03-07")?.version).toBe("v1");
    expect(snapshotForDate(latest, "2026-03-08")?.version).toBe("v3");
    const undone = undoPending(latest, latest.revision, "2026-03-07");
    expect(undone.ok && snapshotForDate(undone.state, "2026-03-08")?.version).toBe("v1");
  });
  it("uses calendar dates across DST, month and year boundaries", () => {
    expect(nextLocalDate("2026-03-07")).toBe("2026-03-08");
    expect(nextLocalDate("2026-11-01")).toBe("2026-11-02");
    expect(nextLocalDate("2026-12-31")).toBe("2027-01-01");
    expect(nextLocalDate("2026-02-30")).toBeNull();
  });
  it("rejects stale edits, invalid features, canonical duplicates and more than five", () => {
    expect(edit(EMPTY_SEED_POOL, { expectedRevision: 2 })).toMatchObject({ ok: false, error: "stale_revision" });
    expect(edit(EMPTY_SEED_POOL, { seeds: [{ ...seed("one"), features: { topic: [], object: [], method: [] } }] })).toMatchObject({ ok: false, error: "invalid_seed" });
    expect(edit(EMPTY_SEED_POOL, { seeds: [seed("one"), { ...seed("two"), canonicalKey: "doi:one" }] })).toMatchObject({ ok: false, error: "duplicate" });
    expect(edit(EMPTY_SEED_POOL, { seeds: Array.from({ length: 6 }, (_, i) => seed(String(i))) })).toMatchObject({ ok: false, error: "too_many" });
  });
  it("forget scrubs every version immediately without touching another seed", () => {
    const initial = success(edit(EMPTY_SEED_POOL, { seeds: [seed("one"), seed("two")] }));
    const pending = success(edit(initial, { version: "v2", seeds: [seed("one")] }));
    const result = forgetSeed(pending, pending.revision, "one");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.revocationGeneration).toBe(1);
    expect(snapshotForDate(result.state, "2026-03-07")?.seeds.map((s) => s.id)).toEqual(["two"]);
    expect(snapshotForDate(result.state, "2026-03-08")?.seeds).toEqual([]);
  });
});
