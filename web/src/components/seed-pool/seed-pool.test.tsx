import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("react", async (original) => { const actual = await original<typeof import("react")>(); const { hookRuntime } = await import("@/test-support/hook-runtime"); return { ...actual, ...hookRuntime.hooks }; });
const account = vi.hoisted(() => ({ authOutcome: "signed-in", authUserId: "owner-a" as string | null }));
vi.mock("@/components/profile-sync", () => ({ useSyncGate: (select: (s: typeof account) => unknown) => select(account) }));
const api = vi.hoisted(() => ({ get: vi.fn(), upload: vi.fn(), save: vi.fn(), forget: vi.fn() }));
vi.mock("@/lib/seed-pool/client-api", () => ({ getSeedPool: api.get, uploadSeedPaper: api.upload, saveSeedPool: api.save, forgetSeedPaper: api.forget, SeedPoolRequestError: class extends Error { constructor(message: string, public status: number, public detail: unknown) { super(message); } } }));
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { hookRuntime } from "@/test-support/hook-runtime";
import { OwnerSeedPool, SeedPool } from "./seed-pool";
import { SeedPoolRequestError } from "@/lib/seed-pool/client-api";
const seed = (id: string) => ({ id, uploadId: id, canonicalKey: id, contentHash: id, title: `Paper ${id}`, features: { topic: ["soil"], object: ["roots"], method: ["imaging"] } });
const editor = () => ({ status: "ready", schemaInstalled: true, ownerLocalDate: "2026-11-01", timezone: "America/Chicago", snapshot: { version: "v", effectiveLocalDate: "2026-11-01", seeds: [seed("a")], revocationGeneration: 0 }, availableAssets: [seed("a")], revision: 2, revocationGeneration: 0 });
type El = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
const all = (node: ReactNode): El[] => Array.isArray(node) ? node.flatMap(all) : node && typeof node === "object" && "props" in node ? [node as El, ...all((node as El).props.children)] : [];
const words = (node: ReactNode): string => Array.isArray(node) ? node.map(words).join("") : typeof node === "string" || typeof node === "number" ? String(node) : node && typeof node === "object" && "props" in node ? words((node as El).props.children) : "";
const btn = (nodes: El[], text: string) => nodes.find((n) => n.type === "button" && words(n.props.children) === text)!;
type Step = (nodes: El[]) => void;
async function run(steps: Step[]) {
 const pending = [...steps]; let nodes: El[] = [];
 const mounted = await hookRuntime.mount(() => { const tree = OwnerSeedPool({}); nodes = all(tree); const [round, setRound] = useState(0); useEffect(() => { if (!btn(nodes, "Save pool") || !pending.length) return; pending.shift()!(nodes); setRound((n) => n + 1); }, [round, !!btn(nodes, "Save pool")]); return tree; }, { maxRounds: 100 });
 mounted.unmount(); expect(pending).toHaveLength(0); return nodes;
}
const press = (text: string): Step => (nodes) => (btn(nodes, text).props.onClick as () => void)();
const change = (node: El, value: unknown) => (node.props.onChange as (value: unknown) => void)(value);
const file = (nodes: El[], name = "invented.pdf") => change(nodes.find((n) => n.type === "input" && n.props.type === "file")!, { target: { files: [new File(["%PDF"], name, { type: "application/pdf" })], value: "x" } });
const rights = (nodes: El[]) => change(nodes.filter((n) => n.type === "input" && n.props.type === "checkbox").at(-1)!, { target: { checked: true } });
beforeEach(() => { account.authOutcome = "signed-in"; account.authUserId = "owner-a"; vi.clearAllMocks(); api.get.mockResolvedValue(editor()); api.save.mockResolvedValue({ status: "ok", revision: 3 }); api.upload.mockResolvedValue(seed("b")); });
describe("seed editor interactions", () => {
 it("requires rights, stages the PDF, and saves once", async () => {
  await run([file, (n) => { expect(api.upload).not.toHaveBeenCalled(); expect(words(n)).toContain("Confirm you have the right"); rights(n); }, file, (n) => { expect(api.upload).toHaveBeenCalledTimes(1); expect(words(n)).toContain("ready"); expect(api.save).not.toHaveBeenCalled(); }, press("Save pool")]);
  expect(api.save).toHaveBeenCalledTimes(1); expect(api.save).toHaveBeenCalledWith(2, ["a", "b"], false);
 });
 it("does not add an unreadable PDF to the pool", async () => {
  api.upload.mockRejectedValue(new Error("This PDF has no readable text."));
  await run([rights, file, (n) => expect(words(n)).toContain("no readable text"), press("Save pool")]); expect(api.save).toHaveBeenCalledWith(2, ["a"], false);
 });
 it("removes from the next pool and supports pending undo", async () => {
  api.get.mockResolvedValue({ ...editor(), pending: { version: "v2", effectiveLocalDate: "2026-11-02", seeds: [seed("a")], revocationGeneration: 0 } });
  await run([(n) => { expect(words(n)).toContain("Effective 2026-11-02 · America/Chicago"); change(n.find((x) => x.type === "input" && x.props.type === "checkbox" && x.props.checked === true)!, {}); }, press("Save pool")]);
  expect(api.save).toHaveBeenCalledWith(2, [], false); api.save.mockClear(); await run([press("Undo pending changes")]); expect(api.save).toHaveBeenCalledWith(2, ["a"], true);
 });
 it("reloads a stale save", async () => { api.save.mockRejectedValue(new SeedPoolRequestError("stale", 409, {})); await run([press("Save pool"), (n) => expect(words(n)).toContain("changed elsewhere")]); expect(api.get).toHaveBeenCalledTimes(2); });
 it("confirms forgetting and reports pending cleanup", async () => {
  api.forget.mockRejectedValue(new SeedPoolRequestError("pending", 503, { status: "cleanup_pending", revision: 3 }));
  await run([press("Forget this PDF and its recommendations"), (n) => { expect(api.forget).not.toHaveBeenCalled(); expect(words(n)).toContain("Notes and your reading library will not be deleted"); }, press("Confirm forget"), (n) => expect(words(n)).toContain("File cleanup is pending")]); expect(api.forget).toHaveBeenCalledWith("a", 2);
 });
});



it("withholds the previous owner's editor on sign-out and keys the next account", () => {
 const first = SeedPool({});
 expect(first.key).toBe("owner-a");
 account.authOutcome = "signed-out"; account.authUserId = null;
 const signedOut = SeedPool({});
 expect(words(signedOut)).toContain("Sign in");
 expect(words(signedOut)).not.toContain("Paper a");
 account.authOutcome = "signed-in"; account.authUserId = "owner-b";
 expect(SeedPool({}).key).toBe("owner-b");
});

it("accepts five selected papers and rejects a sixth before uploading", async () => {
 const papers = ["a", "b", "c", "d", "e"].map(seed);
 api.get.mockResolvedValue({ ...editor(), snapshot: { ...editor().snapshot, seeds: papers }, availableAssets: papers });
 await run([rights, file, (n) => expect(words(n)).toContain("at most five papers")]);
 expect(api.upload).not.toHaveBeenCalled();
});


it("uploads a batch into the draft before a single save", async () => {
 api.upload.mockResolvedValueOnce(seed("b")).mockResolvedValueOnce(seed("c"));
 await run([rights, (n) => change(n.find((x) => x.type === "input" && x.props.type === "file")!, { target: { files: [new File(["%PDF"], "one.pdf", { type: "application/pdf" }), new File(["%PDF"], "two.pdf", { type: "application/pdf" })], value: "x" } }), (n) => { expect(api.upload).toHaveBeenCalledTimes(2); expect(api.save).not.toHaveBeenCalled(); expect(words(n)).toContain("two.pdf: ready"); }, press("Save pool")]);
 expect(api.save).toHaveBeenCalledTimes(1); expect(api.save).toHaveBeenCalledWith(2, ["a", "b", "c"], false);
});

it("retries pending cleanup with its returned revision", async () => {
 api.forget.mockRejectedValueOnce(new SeedPoolRequestError("pending", 503, { status: "cleanup_pending", revision: 3 })).mockResolvedValueOnce({ status: "forgotten", revision: 4 });
 await run([press("Forget this PDF and its recommendations"), press("Confirm forget"), press("Retry file cleanup"), (n) => expect(words(n)).toContain("were forgotten")]);
 expect(api.forget).toHaveBeenNthCalledWith(2, "a", 3);
});


it("shows server-reported cleanup after reload without restoring erased titles", async () => {
 api.get.mockResolvedValue({ ...editor(), cleanupPending: [{ id: "revoked-id" }] });
 api.forget.mockResolvedValue({ status: "forgotten", revision: 3 });
 await run([(n) => { expect(words(n)).toContain("File cleanup is pending"); expect(words(n)).not.toContain("revoked-id"); }, press("Retry file cleanup 1")]);
 expect(api.forget).toHaveBeenCalledWith("revoked-id", 2);
});


it("rejects a response without extracted facets and cannot save an empty initial pool", async () => {
 api.get.mockResolvedValue({ ...editor(), status: "none", snapshot: null, availableAssets: [] });
 api.upload.mockResolvedValue({ ...seed("scan"), features: { topic: [], object: [], method: [] } });
 await run([rights, file, (n) => { expect(words(n)).toContain("No usable text was recognized"); expect(btn(n, "Save pool").props.disabled).toBe(true); }]);
 expect(api.save).not.toHaveBeenCalled();
});


it("does not show a previous owner's late response after the editor unmounts", async () => {
 let release!: (value: unknown) => void;
 api.get.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
 const old = await hookRuntime.mount(() => OwnerSeedPool({}));
 old.unmount();
 const next = { ...editor(), snapshot: { ...editor().snapshot, seeds: [seed("new")] }, availableAssets: [seed("new")] };
 api.get.mockResolvedValueOnce(next);
 const current = await hookRuntime.mount(() => OwnerSeedPool({}));
 expect(words(current.value)).toContain("Paper new");
 release(editor());
 await new Promise((resolve) => setTimeout(resolve, 0));
 expect(words(current.value)).toContain("Paper new");
 expect(words(current.value)).not.toContain("Paper a");
 current.unmount();
});
