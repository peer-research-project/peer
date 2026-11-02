import { createAdminClient } from "@/lib/supabase/admin";
import { SeedPoolRepository, type SeedRpcOutcome } from "./repository";
import type { ResolveSeedPoolOptions, SeedPoolResolution } from "./types";

const unavailable = (): SeedPoolResolution => ({ status: "unavailable", schemaInstalled: null, ownerLocalDate: null, timezone: null, snapshot: null, revision: null, revocationGeneration: 0 });
/** Server-only entry point. Owner comes from authenticated server state, never request JSON. */
export async function resolveSeedPool(ownerId: string, options: ResolveSeedPoolOptions = {}): Promise<SeedPoolResolution> {
  if (!ownerId) return unavailable();
  try {
    const repo = new SeedPoolRepository(createAdminClient());
    const installed = await repo.installed();
    if (installed === "missing") return { status: "none", schemaInstalled: false, ownerLocalDate: null, timezone: null, snapshot: null, revision: 0, revocationGeneration: 0 };
    if (installed !== "yes") return unavailable();
    const resolved = await repo.resolve(ownerId, options.targetLocalDate, options.now);
    if (!resolved || resolved.status === "unavailable" || !resolved.ownerLocalDate || !resolved.timezone) return unavailable();
    return { ...resolved, schemaInstalled: true };
  } catch { return unavailable(); }
}
export interface SeedBatchFence { ownerId: string; localDate: string; expectedVersion: string; expectedRevocationGeneration: number }
export interface SeedBatchIdentity extends SeedBatchFence { batchId: string }
export interface SeedPreparedBatch extends SeedBatchFence { intentVersion?: string; papers: unknown[]; servedItems: unknown[] }
async function fence(name: "seed_pool_mark_batch_served" | "seed_pool_put_prepared_batch" | "seed_pool_ack_batch", args: Record<string, unknown>): Promise<SeedRpcOutcome | null> {
  try { return await new SeedPoolRepository(createAdminClient()).outputFence(name, args); } catch { return null; }
}
const common = (input: SeedBatchFence) => ({ p_owner_id: input.ownerId, p_local_date: input.localDate, p_expected_version: input.expectedVersion, p_expected_revocation_generation: input.expectedRevocationGeneration });
export function markSeedBatchServed(input: SeedBatchIdentity): Promise<SeedRpcOutcome | null> {
  return fence("seed_pool_mark_batch_served", { ...common(input), p_batch_id: input.batchId });
}
export function ackSeedBatch(input: SeedBatchIdentity): Promise<SeedRpcOutcome | null> {
  return fence("seed_pool_ack_batch", { ...common(input), p_batch_id: input.batchId });
}
export function putSeedPreparedBatch(input: SeedPreparedBatch): Promise<SeedRpcOutcome | null> {
  return fence("seed_pool_put_prepared_batch", { ...common(input), p_intent_version: input.intentVersion ?? null, p_papers: input.papers, p_served_items: input.servedItems });
}
