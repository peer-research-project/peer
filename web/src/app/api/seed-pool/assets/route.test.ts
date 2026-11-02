import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), enabled: vi.fn(() => true), origin: vi.fn(() => true), extract: vi.fn(), doi: vi.fn(), build: vi.fn(), write: vi.fn(), remove: vi.fn(), resolve: vi.fn(), stage: vi.fn(), finish: vi.fn(), deleteRow: vi.fn(), stagedOwner: vi.fn(() => false), stagedRead: vi.fn(), stagedRemove: vi.fn() }));
vi.mock("@/lib/seed-pool/auth", () => ({ seedRequestContext: mocks.context }));
vi.mock("@/lib/papers/upload-access", () => ({ hostedUploadsEnabled: mocks.enabled, sameOriginUploadRequest: mocks.origin, UPLOAD_RIGHTS_VERSION: "rights-v1", PRIVATE_UPLOAD_HEADERS: { "Cache-Control": "private, no-store" } }));
vi.mock("@/lib/papers/upload-store", () => ({ isOwnStagedUpload: mocks.stagedOwner, readStagedUpload: mocks.stagedRead, removeStagedUpload: mocks.stagedRemove }));
vi.mock("@/lib/papers/pdf-text", () => ({ extractPdfTextFromBytes: mocks.extract }));
vi.mock("@/lib/seed-pool/features", () => ({ verifiedPublicDoi: mocks.doi, seedFromExtractedDocument: mocks.build }));
vi.mock("@/lib/papers/upload-backend", () => ({ uploadBackend: () => ({ write: mocks.write, remove: mocks.remove }) }));
import { POST } from "./route";
const id = "11111111-1111-4111-8111-111111111111";
const owner = "22222222-2222-4222-8222-222222222222";
const paper = { id, uploadId: `seed:${id}`, canonicalKey: "sha256:test", contentHash: "a".repeat(64), title: "Fictional", features: { topic: ["cathode"], object: [], method: [] } };
function request() { const form = new FormData(); form.set("rightsVersion", "rights-v1"); form.set("file", new File(["%PDF-1.4 fictional"], "seed.pdf", { type: "application/pdf" })); return new Request("http://localhost", { method: "POST", body: form }); }
beforeEach(() => {
  vi.clearAllMocks(); mocks.stagedOwner.mockReturnValue(false); mocks.stagedRemove.mockResolvedValue(undefined); mocks.enabled.mockReturnValue(true); mocks.origin.mockReturnValue(true);
  mocks.context.mockResolvedValue({ status: "ready", ownerId: owner, repo: { resolve: mocks.resolve, stageAsset: mocks.stage, finishAsset: mocks.finish, removeAssetRecord: mocks.deleteRow } });
  mocks.resolve.mockResolvedValue({ status: "none", revocationGeneration: 7 });
  mocks.extract.mockResolvedValue({ ok: true, doc: { title: "Fictional", sections: [] } });
  mocks.doi.mockResolvedValue(undefined); mocks.build.mockReturnValue(paper); mocks.stage.mockResolvedValue(true); mocks.finish.mockResolvedValue(true); mocks.write.mockResolvedValue(undefined); mocks.remove.mockResolvedValue(undefined); mocks.deleteRow.mockResolvedValue(true);
});
describe("private seed asset upload", () => {
  it("rejects unreadable extraction and makes no seed or storage write", async () => {
    mocks.extract.mockResolvedValue({ ok: false });
    const response = await POST(request());
    expect(response.status).toBe(422);
    expect(mocks.stage).not.toHaveBeenCalled(); expect(mocks.write).not.toHaveBeenCalled();
  });
  it("stages under the authenticated owner and captured generation in a distinct namespace", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.stage).toHaveBeenCalledWith(owner, paper, expect.stringMatching(/^seed-pool\/[a-f0-9]{64}\/11111111-1111-4111-8111-111111111111\.pdf$/), 7);
    expect(mocks.finish).toHaveBeenCalledWith(owner, id);
  });
  it("rejects a privacy-generation race before writing the file", async () => {
    mocks.stage.mockResolvedValue(false);
    expect((await POST(request())).status).toBe(409);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("retains a staging record when the storage write outcome is uncertain", async () => {
    mocks.write.mockRejectedValue(new Error("connection lost"));
    expect((await POST(request())).status).toBe(503);
    expect(mocks.finish).not.toHaveBeenCalled();
    expect(mocks.deleteRow).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

});

 it("does not create a ready seed when consuming a direct-upload copy fails", async () => {
  mocks.stagedOwner.mockReturnValue(true); mocks.stagedRead.mockResolvedValue(Buffer.from("%PDF-1.4 fictional"));
  mocks.remove.mockRejectedValueOnce(new Error("storage unavailable"));
  const form = new FormData(); form.set("rightsVersion", "rights-v1"); form.set("staged", "incoming/owner/file.pdf");
  const response = await POST(new Request("http://localhost", { method: "POST", body: form }));
  expect(response.status).toBe(503); expect(mocks.stage).not.toHaveBeenCalled(); expect(mocks.write).not.toHaveBeenCalled();
 });
 it("consumes the direct-upload copy before staging a seed", async () => {
  mocks.stagedOwner.mockReturnValue(true); mocks.stagedRead.mockResolvedValue(Buffer.from("%PDF-1.4 fictional"));
  const form = new FormData(); form.set("rightsVersion", "rights-v1"); form.set("staged", "incoming/owner/file.pdf");
  expect((await POST(new Request("http://localhost", { method: "POST", body: form }))).status).toBe(200);
  expect(mocks.remove.mock.invocationCallOrder[0]).toBeLessThan(mocks.stage.mock.invocationCallOrder[0]);
 });
