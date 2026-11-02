import { afterEach, expect, it, vi } from "vitest";
import { runFeedPipeline } from "./pipeline";
import { bySourceId } from "@/lib/sources";
import { createTrustedPaperCacheScope } from "@/lib/opportunities/private-paper-cache";
import type { RawItem } from "@/lib/sources/types";
import type { CachedPool, PoolCache } from "@/lib/opportunities/pool-cache";
class MemoryCache implements PoolCache { values = new Map<string, CachedPool>(); async get(k: string) { return this.values.get(k) ?? null; } async set(k: string, v: CachedPool) { this.values.set(k, v); } }
const original = bySourceId.openalex.fetch;
afterEach(() => { bySourceId.openalex.fetch = original; vi.restoreAllMocks(); vi.useRealTimers(); });
const item = (id: string, title: string): RawItem => ({ id, title, source: "openalex", authors: [], abstract: title, tags: [], url: `https://example.test/${id}`, publishedAt: "2026-11-01", metadata: {} });
it("scores seed-only retrieved candidates through build and read without changing legacy behavior", async () => {
  const now = new Date("2026-11-02T10:00:00Z"); vi.useFakeTimers(); vi.setSystemTime(now);
  bySourceId.openalex.fetch = vi.fn(async () => [item("a", "Forest canopy rainforest tree satellite imaging"), item("b", "Lithium battery transport")]);
  const scope = createTrustedPaperCacheScope({ ownerId: "owner-a", topics: ["lithium battery"], aiTier: 0 });
  const req = { topics: ["lithium battery"], sources: ["openalex" as const], paperCacheScope: scope, aiTier: 0 as const };
  const cache = new MemoryCache();
  const legacy = await runFeedPipeline(req, { cache, now });
  expect(legacy.items.map((i) => i.id)).not.toContain("a");
  const snapshot = { version: "v1", effectiveLocalDate: "2026-11-02", revocationGeneration: 0, seeds: [{ id: "seed", uploadId: "private", canonicalKey: "doi:test", title: "Private", features: { topic: ["forest canopy"], object: ["rainforest tree"], method: ["satellite imaging"] } }] };
  const options = { cache, now, seedSnapshot: snapshot, seedTargetLocalDate: "2026-11-02" };
  const seeded = await runFeedPipeline(req, options);
  expect(seeded.items.map((i) => i.id)).toContain("a");
  expect(seeded.items.find((i) => i.id === "a")?.relevanceReason).toContain("forest canopy");
  const cached = await runFeedPipeline(req, options);
  expect(cached.items.map((i) => i.id)).toEqual(seeded.items.map((i) => i.id));
  await expect(runFeedPipeline({ ...req, paperCacheScope: undefined }, options)).rejects.toThrow("owner-scoped");
});
