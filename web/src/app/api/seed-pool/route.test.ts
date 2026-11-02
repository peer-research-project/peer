import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), origin: vi.fn(() => true), apply: vi.fn(), editor: vi.fn(), installed: vi.fn(), forget: vi.fn(), cleanup: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/seed-pool/auth", () => ({ seedRequestContext: mocks.context }));
vi.mock("@/lib/papers/upload-access", () => ({ PRIVATE_UPLOAD_HEADERS: { "Cache-Control": "private, no-store" }, sameOriginUploadRequest: mocks.origin }));
vi.mock("@/lib/papers/upload-backend", () => ({ uploadBackend: () => ({ remove: mocks.remove }) }));
import { GET, PUT } from "./route";
import { DELETE } from "./assets/[id]/route";
const id = "11111111-1111-4111-8111-111111111111";
const owner = "22222222-2222-4222-8222-222222222222";
const req = (body: unknown) => new Request("http://localhost", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.origin.mockReturnValue(true);
  mocks.context.mockResolvedValue({ status: "ready", ownerId: owner, repo: { apply: mocks.apply, installed: mocks.installed, editor: mocks.editor, forget: mocks.forget, markRevokedCleanupComplete: mocks.cleanup } });
  mocks.installed.mockResolvedValue("yes"); mocks.editor.mockResolvedValue({ status: "none" });
});
describe("private seed pool API", () => {
  it("requires authenticated ownership and distinguishes an outage", async () => {
    mocks.context.mockResolvedValueOnce({ status: "unauthenticated" }).mockResolvedValueOnce({ status: "unavailable" });
    expect((await GET()).status).toBe(401);
    expect((await GET()).status).toBe(503);
  });
  it("submits only authenticated owner and asset IDs, ignores client features, and returns CAS conflicts", async () => {
    mocks.apply.mockResolvedValueOnce({ status: "ok", revision: 1 }).mockResolvedValueOnce({ status: "stale_revision", revision: 1 });
    expect((await PUT(req({ expectedRevision: 0, seedIds: [id], ownerId: "other", features: { topic: ["injected"] } }))).status).toBe(200);
    expect(mocks.apply).toHaveBeenCalledWith(owner, 0, [id], false);
    expect((await PUT(req({ expectedRevision: 0, seedIds: [id] }))).status).toBe(409);
    expect((await PUT(req({ expectedRevision: 0, seedIds: Array(6).fill(id) }))).status).toBe(400);
  });
  it("revokes first and leaves a retryable tombstone when object cleanup fails", async () => {
    const { createHash } = await import("node:crypto");
    const key = createHash("sha256").update(`account:${owner}`).digest("hex");
    const objectName = `seed-pool/${key}/${id}.pdf`;
    mocks.forget.mockResolvedValue({ status: "revoked", revision: 3, objects: [{ id, objectName, writerSettled: true, cleanupAfter: new Date(Date.now() - 1000).toISOString() }] });
    mocks.remove.mockRejectedValueOnce(new Error("storage down"));
    const response = await DELETE(new Request("http://localhost", { method: "DELETE", body: JSON.stringify({ expectedRevision: 2 }) }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: "cleanup_pending", revision: 3 });
    expect(mocks.forget).toHaveBeenCalledWith(owner, 2, id);
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });
  it("does not remove a staging object until its in-flight writer has expired", async () => {
    mocks.forget.mockResolvedValue({ status: "revoked", revision: 1, objects: [{ id, cleanupAfter: new Date(Date.now() + 60_000).toISOString() }] });
    const response = await DELETE(new Request("http://localhost", { method: "DELETE", body: JSON.stringify({ expectedRevision: 0 }) }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(503);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("keeps an unsettled writer's tombstone even after its cleanup time", async () => {
    const { createHash } = await import("node:crypto");
    const key = createHash("sha256").update(`account:${owner}`).digest("hex");
    mocks.forget.mockResolvedValue({ status: "revoked", revision: 1, objects: [{ id, objectName: `seed-pool/${key}/${id}.pdf`, writerSettled: false, cleanupAfter: new Date(Date.now() - 60_000).toISOString() }] });
    const response = await DELETE(new Request("http://localhost", { method: "DELETE", body: JSON.stringify({ expectedRevision: 0 }) }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(503);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("never reports forget success without a cleanup target", async () => {
    mocks.forget.mockResolvedValue({ status: "revoked", revision: 1, objects: [] });
    const response = await DELETE(new Request("http://localhost", { method: "DELETE", body: JSON.stringify({ expectedRevision: 0 }) }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(503);
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });

});


it("returns owner-only pending cleanup IDs and retries after refresh with the current revision", async () => {
  const { createHash } = await import("node:crypto");
  const key = createHash("sha256").update(`account:${owner}`).digest("hex");
  const objectName = `seed-pool/${key}/${id}.pdf`;
  mocks.editor.mockResolvedValue({ status: "none", revision: 3, availableAssets: [], cleanupPending: [{ id }] });
  const refreshed = await GET();
  expect(refreshed.status).toBe(200);
  expect(await refreshed.json()).toMatchObject({ revision: 3, cleanupPending: [{ id }] });
  expect(mocks.editor).toHaveBeenCalledWith(owner);
  mocks.forget.mockResolvedValue({ status: "revoked", revision: 3, revocationGeneration: 1, objects: [{ id, objectName, writerSettled: true, cleanupAfter: new Date(Date.now() - 1000).toISOString() }] });
  mocks.remove.mockResolvedValue(undefined); mocks.cleanup.mockResolvedValue(true);
  const retry = await DELETE(new Request("http://localhost", { method: "DELETE", body: JSON.stringify({ expectedRevision: 3 }) }), { params: Promise.resolve({ id }) });
  expect(retry.status).toBe(200);
  expect(mocks.forget).toHaveBeenCalledWith(owner, 3, id);
  expect(mocks.cleanup).toHaveBeenCalledWith(owner, [id]);
});
