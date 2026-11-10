import { identityForRawItem } from "@/lib/feed/paper-identity";
import type { ScoredItem } from "@/lib/scoring/types";
import { SupabaseDashboardDeliveryLedger } from "@/lib/dashboard/delivery-ledger";
import { markSeedBatchServed, putSeedPreparedBatch } from "./server";
import type { SeedOutputContext } from "./output";

/** Freeze one owner/day selection for both web and email. The RPC serializes
 * publication with owner pool edits; a changed/revoked version fails closed. */
export async function freezeSeedDigestItems(ownerId: string, context: Extract<SeedOutputContext, { kind: "ready" }>, items: ScoredItem[]): Promise<ScoredItem[] | null> {
  const ledger = new SupabaseDashboardDeliveryLedger();
  let batch = await ledger.getBatch(ownerId, context.localDate);
  const matches = () => batch && (batch.seedPoolVersion ?? "none") === context.version && (batch.seedRevocationGeneration ?? 0) === context.revocationGeneration;
  if (batch && batch.status !== "prepared" && !matches()) return null;
  if (!batch || !matches()) {
    const placed = await putSeedPreparedBatch({ ownerId, localDate: context.localDate, expectedVersion: context.version, expectedRevocationGeneration: context.revocationGeneration, papers: items.map(identityForRawItem), servedItems: items });
    if (!placed || !["prepared", "already_served"].includes(placed.status)) return null;
    batch = await ledger.getBatch(ownerId, context.localDate);
  }
  if (!batch || !matches() || !Array.isArray(batch.servedItems)) return null;
  const marked = await markSeedBatchServed({ ownerId, localDate: context.localDate, batchId: batch.id, expectedVersion: context.version, expectedRevocationGeneration: context.revocationGeneration });
  if (!marked || !["served", "already_served"].includes(marked.status)) return null;
  return [...batch.servedItems] as ScoredItem[];
}
