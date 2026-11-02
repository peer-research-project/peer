import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ table: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.table, rpc: mocks.rpc }) }));
import { ackSeedBatch, markSeedBatchServed, putSeedPreparedBatch, resolveSeedPool } from "./server";
const selectResult = (error: null | { code: string }) => ({ select: () => ({ limit: async () => ({ error }) }) });
beforeEach(() => { mocks.table.mockReset(); mocks.rpc.mockReset(); });
describe("server seed resolution", () => {
  it.each(["42P01", "PGRST205"])("uses legacy no-seed only when the seed table is absent (%s)", async (code) => {
    mocks.table.mockReturnValue(selectResult({ code }));
    expect(await resolveSeedPool("owner-a")).toMatchObject({ status: "none", schemaInstalled: false, snapshot: null, revision: 0, revocationGeneration: 0 });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not turn an outage or malformed response into an empty pool", async () => {
    mocks.table.mockReturnValue(selectResult({ code: "08006" }));
    expect((await resolveSeedPool("owner-a")).status).toBe("unavailable");
    mocks.table.mockReturnValue(selectResult(null));
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "08006" } });
    expect((await resolveSeedPool("owner-a")).status).toBe("unavailable");
  });
  it("passes a future job date to the authoritative owner resolver", async () => {
    mocks.table.mockReturnValue(selectResult(null));
    mocks.rpc.mockResolvedValue({ data: { status: "ready", schemaInstalled: true, ownerLocalDate: "2026-03-07", timezone: "America/Chicago", revision: 2, revocationGeneration: 1, snapshot: { version: "v2", effectiveLocalDate: "2026-03-08", seeds: [], revocationGeneration: 1 } }, error: null });
    const now = new Date("2026-03-08T03:00:00Z");
    expect((await resolveSeedPool("owner-a", { targetLocalDate: "2026-03-08", now })).snapshot?.version).toBe("v2");
    expect(mocks.rpc).toHaveBeenCalledWith("seed_pool_resolve", { p_owner_id: "owner-a", p_target_date: "2026-03-08", p_now: now.toISOString() });
  });
  it("uses fenced service RPCs for prepare, serve, and ack including the explicit none version", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "stale_pool" }, error: null });
    const base = { ownerId: "owner-a", localDate: "2026-03-08", expectedVersion: "none", expectedRevocationGeneration: 0 };
    await markSeedBatchServed({ ...base, batchId: "b1" });
    await ackSeedBatch({ ...base, batchId: "b1" });
    await putSeedPreparedBatch({ ...base, papers: [], servedItems: [] });
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(["seed_pool_mark_batch_served", "seed_pool_ack_batch", "seed_pool_put_prepared_batch"]);
    for (const [, args] of mocks.rpc.mock.calls) expect(args).toMatchObject({ p_owner_id: "owner-a", p_local_date: "2026-03-08", p_expected_version: "none", p_expected_revocation_generation: 0 });
  });
});
