import type { SeedPaper, SeedPoolResolution } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";

/** These service-role operations are never exposed to browsers directly. */
type Admin = ReturnType<typeof createAdminClient>;
type DbError = { code?: string; message?: string };
export function isMissingSeedTable(error: DbError | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}
export type SeedRpcOutcome = { status: string; [key: string]: unknown };
export class SeedPoolRepository {
  constructor(private readonly db: Admin) {}
  async installed(): Promise<"yes" | "missing" | "unavailable"> {
    try {
      const { error } = await this.db.from("seed_pool_state").select("owner_id").limit(1);
      return error ? (isMissingSeedTable(error) ? "missing" : "unavailable") : "yes";
    } catch { return "unavailable"; }
  }
  private async rpc(name: string, args: Record<string, unknown>): Promise<SeedRpcOutcome | null> {
    try {
      const { data, error } = await this.db.rpc(name, args);
      if (error || !data || typeof data !== "object" || Array.isArray(data) || typeof data.status !== "string") return null;
      return data as SeedRpcOutcome;
    } catch { return null; }
  }
  async resolve(ownerId: string, targetLocalDate?: string, now?: Date): Promise<SeedPoolResolution | null> {
    const data = await this.rpc("seed_pool_resolve", { p_owner_id: ownerId, p_target_date: targetLocalDate ?? null, p_now: now?.toISOString() ?? null });
    if (!data || !["ready", "none", "unavailable"].includes(data.status)) return null;
    return data as unknown as SeedPoolResolution;
  }
  async apply(ownerId: string, expectedRevision: number, seedIds: string[], undo = false): Promise<SeedRpcOutcome | null> {
    return this.rpc("seed_pool_apply", { p_owner_id: ownerId, p_expected_revision: expectedRevision, p_seed_ids: seedIds, p_undo: undo });
  }
  async forget(ownerId: string, expectedRevision: number, seedId: string): Promise<SeedRpcOutcome | null> {
    return this.rpc("seed_pool_forget", { p_owner_id: ownerId, p_expected_revision: expectedRevision, p_seed_id: seedId });
  }
  async stageAsset(ownerId: string, paper: SeedPaper, objectName: string, generation: number): Promise<boolean> {
    const result = await this.rpc("seed_pool_stage_asset", { p_owner_id: ownerId, p_expected_revocation_generation: generation, p_id: paper.id, p_upload_id: paper.uploadId, p_canonical_key: paper.canonicalKey, p_content_hash: paper.contentHash, p_title: paper.title, p_features: paper.features, p_public_ids: paper.publicIds ?? {}, p_object_name: objectName });
    return result?.status === "staging";
  }
  async finishAsset(ownerId: string, seedId: string): Promise<boolean> {
    const result = await this.rpc("seed_pool_finish_asset", { p_owner_id: ownerId, p_seed_id: seedId });
    return result?.status === "ready";
  }
  async removeAssetRecord(ownerId: string, seedId: string, status: "staging" | "revoked"): Promise<boolean> {
    try { const { error } = await this.db.from("seed_pool_assets").delete().eq("owner_id", ownerId).eq("id", seedId).eq("status", status); return !error; } catch { return false; }
  }
  async markRevokedCleanupComplete(ownerId: string, seedIds: string[]): Promise<boolean> {
    try { const { error } = await this.db.from("seed_pool_assets").update({ cleanup_complete: true }).eq("owner_id", ownerId).eq("status", "revoked").in("id", seedIds); return !error; } catch { return false; }
  }
  async editor(ownerId: string): Promise<SeedRpcOutcome | null> {
    return this.rpc("seed_pool_editor", { p_owner_id: ownerId });
  }
  async claimCleanup(): Promise<Array<{ id: string; ownerId: string; objectName: string }> | null> {
    try {
      const { data, error } = await this.db.rpc("seed_pool_claim_cleanup", { p_limit: 25 });
      if (error || !Array.isArray(data)) return null;
      if (!data.every((entry) => entry && typeof entry.id === "string" && typeof entry.ownerId === "string" && typeof entry.objectName === "string")) return null;
      return data;
    } catch { return null; }
  }
  async outputFence(name: "seed_pool_mark_batch_served" | "seed_pool_put_prepared_batch" | "seed_pool_ack_batch" | "seed_pool_claim_digest" | "seed_pool_validate_digest_send" | "seed_pool_record_feed_served" | "seed_pool_persist_digest_email" | "seed_pool_put_private_pool", args: Record<string, unknown>): Promise<SeedRpcOutcome | null> {
    return this.rpc(name, args);
  }
}
