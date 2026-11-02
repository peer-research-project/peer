import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const mocks = vi.hoisted(() => ({ installed: vi.fn(), claim: vi.fn(), complete: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/seed-pool/repository", () => ({ SeedPoolRepository: class { installed = mocks.installed; claimCleanup = mocks.claim; markRevokedCleanupComplete = mocks.complete; } }));
vi.mock("@/lib/papers/upload-backend", () => ({ uploadBackend: () => ({ remove: mocks.remove }) }));
import { purgeSeedOrphans } from "./lifecycle";
const owner = "22222222-2222-4222-8222-222222222222";
const id = "11111111-1111-4111-8111-111111111111";
const key = createHash("sha256").update(`account:${owner}`).digest("hex");
beforeEach(() => { vi.clearAllMocks(); mocks.installed.mockResolvedValue("yes"); mocks.claim.mockResolvedValue([{ id, ownerId: owner, objectName: `seed-pool/${key}/${id}.pdf` }]); mocks.remove.mockResolvedValue(undefined); mocks.complete.mockResolvedValue(true); });
afterEach(() => vi.restoreAllMocks());
describe("seed orphan cleanup", () => {
  it("removes only validated owner namespace objects and then marks the tombstone complete", async () => {
    await purgeSeedOrphans();
    expect(mocks.remove).toHaveBeenCalledWith([`seed-pool/${key}/${id}.pdf`]);
    expect(mocks.complete).toHaveBeenCalledWith(owner, [id]);
  });
  it("keeps the tombstone when storage deletion fails", async () => {
    mocks.remove.mockRejectedValue(new Error("offline"));
    await expect(purgeSeedOrphans()).rejects.toThrow("incomplete");
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it("never deletes a malformed or unrelated object path", async () => {
    mocks.claim.mockResolvedValue([{ id, ownerId: owner, objectName: "ordinary/other.pdf" }]);
    await expect(purgeSeedOrphans()).rejects.toThrow("incomplete");
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("leaves legacy installations alone and reports generic DB outages", async () => {
    mocks.installed.mockResolvedValueOnce("missing").mockResolvedValueOnce("unavailable");
    await expect(purgeSeedOrphans()).resolves.toBeUndefined();
    await expect(purgeSeedOrphans()).rejects.toThrow("unavailable");
    expect(mocks.claim).not.toHaveBeenCalled();
  });
});
