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
async function fence(name: "seed_pool_mark_batch_served" | "seed_pool_put_prepared_batch" | "seed_pool_ack_batch" | "seed_pool_claim_digest" | "seed_pool_validate_digest_send" | "seed_pool_record_feed_served" | "seed_pool_persist_digest_email" | "seed_pool_put_private_pool", args: Record<string, unknown>): Promise<SeedRpcOutcome | null> {
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

/** Claim is fenced in the same owner transaction as pool edits. */
export interface SeedDigestClaim extends SeedBatchFence { channel: string; itemIds: string[]; payload: unknown }
export interface SeedDigestSend extends SeedBatchFence { deliveryId: number }
export function claimSeedDigest(input: SeedDigestClaim): Promise<SeedRpcOutcome | null> {
  return fence("seed_pool_claim_digest", { ...common(input), p_channel: input.channel, p_item_ids: input.itemIds, p_payload: input.payload });
}
/** Recheck immediately before an external send/retry. A provider call already in flight cannot be recalled. */
export function validateSeedDigestSend(input: SeedDigestSend): Promise<SeedRpcOutcome | null> {
  return fence("seed_pool_validate_digest_send", { ...common(input), p_delivery_id: input.deliveryId });
}

/** Records only an owner/date marker under the same fence; no candidate payload. */
export function recordSeedFeedServed(input: SeedBatchFence): Promise<SeedRpcOutcome | null> {
  return fence("seed_pool_record_feed_served", common(input));
}

/** Seeded email persistence must succeed before sending; it never rewrites a captured payload. */
export function persistSeedDigestEmailAttempt(input: SeedDigestSend & { email: unknown }): Promise<SeedRpcOutcome | null> {
  return fence("seed_pool_persist_digest_email", { ...common(input), p_delivery_id: input.deliveryId, p_email: input.email });
}

/** Seed-derived private pool writes are fenced against concurrent forget. */
export function putSeedPrivatePool(input: SeedBatchFence & { scopeKey: string; payload: unknown }): Promise<SeedRpcOutcome | null> {
  return fence("seed_pool_put_private_pool", { ...common(input), p_scope_key: input.scopeKey, p_payload: input.payload });
}
