import { afterEach, expect, it, vi } from "vitest";
import { runFeedPipeline } from "./pipeline";
import { bySourceId } from "@/lib/sources";
import { createTrustedPaperCacheScope } from "@/lib/opportunities/private-paper-cache";
import type { RawItem } from "@/lib/sources/types";
import type { CachedPool, PoolCache } from "@/lib/opportunities/pool-cache";

// R-C6b: a seeded user keeps the no-seed path's per-author cap and the
// preferred-journal boost. Every paper, author and venue here is invented.
class MemoryCache implements PoolCache { values = new Map<string, CachedPool>(); async get(k: string) { return this.values.get(k) ?? null; } async set(k: string, v: CachedPool) { this.values.set(k, v); } }
const original = bySourceId.openalex.fetch;
afterEach(() => { bySourceId.openalex.fetch = original; vi.restoreAllMocks(); vi.useRealTimers(); });
const now = new Date("2026-11-02T10:00:00Z");
const item = (id: string, title: string, author: string, venue?: string): RawItem => ({ id, title, source: "openalex", authors: [author], abstract: title, tags: [], url: `https://example.test/${id}`, publishedAt: "2026-11-01", metadata: {}, ...(venue ? { venue } : {}) });
const seeds = [{ id: "seed", uploadId: "private", contentHash: "c".repeat(64), canonicalKey: "doi:10.5555/fict.glacier", title: "Invented", features: { topic: ["glacier meltwater"], object: ["moraine lake"], method: ["dye tracing"] } }];
const snapshot = { version: "v1", effectiveLocalDate: "2026-11-02", revocationGeneration: 0, seeds };
async function run(pool: RawItem[], venues?: string[]) {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  bySourceId.openalex.fetch = vi.fn(async () => structuredClone(pool));
  const scope = createTrustedPaperCacheScope({ ownerId: "owner-seed-constraints", topics: ["glacier meltwater"], aiTier: 0 });
  const req = { topics: ["glacier meltwater"], sources: ["openalex" as const], paperCacheScope: scope, aiTier: 0 as const, topN: 10, ...(venues ? { venues } : {}) };
  return runFeedPipeline(req, { cache: new MemoryCache(), now, seedSnapshot: snapshot, seedTargetLocalDate: "2026-11-02" });
}

it("caps one first author at two of the seeded top slots, like the no-seed path", async () => {
  const pool = [
    item("same-1", "Glacier meltwater in a moraine lake by dye tracing", "Dr. Invented Same"),
    item("same-2", "Dye tracing of glacier meltwater through a moraine lake", "Dr. Invented Same"),
    item("same-3", "Moraine lake glacier meltwater pathways from dye tracing", "Dr. Invented Same"),
    item("other", "Glacier meltwater storage in a moraine lake", "Dr. Invented Other"),
  ];
  const res = await run(pool);
  const authors = res.items.map((i) => i.authors[0]);
  expect(res.items.map((i) => i.id)).toContain("other");
  expect(authors.slice(0, 3).filter((a) => a === "Dr. Invented Same")).toHaveLength(2);
  expect(authors.slice(0, 3)).toContain("Dr. Invented Other");
});

it("keeps the preferred-journal boost for a seeded user", async () => {
  const pool = [
    item("plain", "Glacier meltwater in a moraine lake by dye tracing", "Dr. Invented A"),
    item("journal", "Glacier meltwater storage in a moraine lake", "Dr. Invented B", "Journal of Invented Glaciology"),
  ];
  const without = await run(pool);
  expect(without.items.map((i) => i.id)).toEqual(["plain", "journal"]);
  const withVenue = await run(pool, ["Journal of Invented Glaciology"]);
  expect(withVenue.items.map((i) => i.id)).toEqual(["journal", "plain"]);
});
