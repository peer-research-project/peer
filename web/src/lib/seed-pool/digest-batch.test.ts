import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getBatch: vi.fn(), put: vi.fn(), mark: vi.fn() }));
vi.mock("@/lib/dashboard/delivery-ledger", () => ({ SupabaseDashboardDeliveryLedger: class { getBatch = mocks.getBatch; } }));
vi.mock("@/lib/seed-pool/server", () => ({ putSeedPreparedBatch: mocks.put, markSeedBatchServed: mocks.mark }));
import { freezeSeedDigestItems } from "./digest-batch";
import type { ScoredItem } from "@/lib/scoring/types";
const ctx = { kind: "ready" as const, localDate: "2026-11-02", version: "v1", revocationGeneration: 3, snapshot: null };
const item = { id: "x", title: "Actual web item", source: "openalex", authors: [], url: "https://example.test/x", publishedAt: "2026-11-01", metadata: {}, score: 0.5, scoreBreakdown: { keyword: 0, tfidf: 0, topicality: 0, recency: 0, source: 0, combined: 0.5 }, matchedKeywords: [], relevanceReason: "" } as ScoredItem;
const row = { id: "batch", ownerId: "owner", localDate: ctx.localDate, seedPoolVersion: "v1", seedRevocationGeneration: 3, status: "served", servedItems: [item] };
beforeEach(() => { vi.clearAllMocks(); mocks.getBatch.mockResolvedValue(row); mocks.put.mockResolvedValue({ status: "prepared", batchId: "batch" }); mocks.mark.mockResolvedValue({ status: "already_served" }); });
it("uses the already-served web batch for the same owner and day", async () => {
  const result = await freezeSeedDigestItems("owner", ctx, []);
  expect(result).toEqual([item]); expect(mocks.put).not.toHaveBeenCalled();
  expect(mocks.mark).toHaveBeenCalledWith(expect.objectContaining({ ownerId: "owner", batchId: "batch", expectedVersion: "v1", expectedRevocationGeneration: 3 }));
});
it("fails closed if forget invalidates the batch or the atomic serving check", async () => {
  mocks.getBatch.mockResolvedValue({ ...row, seedRevocationGeneration: 2 });
  expect(await freezeSeedDigestItems("owner", ctx, [item])).toBeNull(); expect(mocks.mark).not.toHaveBeenCalled();
  mocks.getBatch.mockResolvedValue(row); mocks.mark.mockResolvedValue({ status: "stale_pool" });
  expect(await freezeSeedDigestItems("owner", ctx, [item])).toBeNull();
});
