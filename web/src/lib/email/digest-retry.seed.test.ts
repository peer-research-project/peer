import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), validate: vi.fn(), persist: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/seed-pool/server", () => ({ resolveSeedPool: mocks.resolve, validateSeedDigestSend: mocks.validate, persistSeedDigestEmailAttempt: mocks.persist }));
vi.mock("@/lib/email/send-digest", () => ({ sendDigestEmail: mocks.send }));
import { handleConflictingEmailClaim } from "./digest-retry";
const now = new Date("2026-11-02T12:00:00Z");
const context = { status: "none", schemaInstalled: true, ownerLocalDate: "2026-11-02", timezone: "UTC", snapshot: { version: "v1", effectiveLocalDate: "2026-11-02", seeds: [], revocationGeneration: 0 }, revision: 1, revocationGeneration: 0 };
const payload = { email: { to: "test@example.test", subject: "subject", html: "html", text: "text", attemptedAt: "2026-11-02T11:30:00Z" } };
const admin = { from: () => ({ select: () => { const q = { eq: () => q, limit: async () => ({ data: [{ id: 7, seed_pool_version: "v1", seed_revocation_generation: 0, payload }], error: null }) }; return q; } }) } as never;
beforeEach(() => { vi.clearAllMocks(); mocks.resolve.mockResolvedValue(context); mocks.validate.mockResolvedValue({ status: "allowed" }); mocks.persist.mockResolvedValue({ status: "persisted" }); mocks.send.mockResolvedValue({ sent: true }); });
describe("seeded digest retries", () => {
  it("rejects a revoked or stale delivery before provider send", async () => {
    mocks.validate.mockResolvedValue({ status: "stale_pool" });
    const out = await handleConflictingEmailClaim({ admin, userId: "owner", localDate: "2026-11-02", idempotencyKey: "key", now });
    expect(out.kind).toBe("skip"); expect(mocks.send).not.toHaveBeenCalled(); expect(mocks.persist).not.toHaveBeenCalled();
  });
  it("validates immediately before replay and persists confirmation through the owner fence", async () => {
    const out = await handleConflictingEmailClaim({ admin, userId: "owner", localDate: "2026-11-02", idempotencyKey: "key", now });
    expect(out.kind).toBe("sent");
    expect(mocks.validate).toHaveBeenCalledWith(expect.objectContaining({ deliveryId: 7, expectedVersion: "v1", expectedRevocationGeneration: 0 }));
    expect(mocks.validate.mock.invocationCallOrder[0]).toBeLessThan(mocks.send.mock.invocationCallOrder[0]);
    expect(mocks.persist).toHaveBeenCalledWith(expect.objectContaining({ deliveryId: 7, email: expect.objectContaining({ sent: true }) }));
  });
});
