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
import { renderToStaticMarkup } from "react-dom/server";
const seed = (id: string) => ({ id, uploadId: id, canonicalKey: id, contentHash: id, title: `Paper ${id}`, features: { topic: ["soil"], object: ["roots"], method: ["imaging"] } });
const editor = () => ({ status: "ready", schemaInstalled: true, ownerLocalDate: "2026-11-01", timezone: "America/Chicago", snapshot: { version: "v", effectiveLocalDate: "2026-11-01", seeds: [seed("a")], revocationGeneration: 0 }, availableAssets: [seed("a")], revision: 2, revocationGeneration: 0 });
type El = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
const all = (node: ReactNode): El[] => Array.isArray(node) ? node.flatMap(all) : node && typeof node === "object" && "props" in node ? [node as El, ...all((node as El).props.children)] : [];
const words = (node: ReactNode): string => Array.isArray(node) ? node.map(words).join("") : typeof node === "string" || typeof node === "number" ? String(node) : node && typeof node === "object" && "props" in node ? words((node as El).props.children) : "";
const btn = (nodes: El[], text: string) => nodes.find((n) => n.type === "button" && words(n.props.children) === text)!;
type Step = (nodes: El[]) => void;
let lastTree: ReactNode = null;
async function run(steps: Step[], onProgress?: (state: { busy: boolean; dirty: boolean }) => void) {
 const pending = [...steps]; let nodes: El[] = [];
 const mounted = await hookRuntime.mount(() => { const tree = OwnerSeedPool({ onProgress }); nodes = all(tree); const [round, setRound] = useState(0); useEffect(() => { if (!btn(nodes, "Save pool") || !pending.length) return; pending.shift()!(nodes); setRound((n) => n + 1); }, [round, !!btn(nodes, "Save pool")]); return tree; }, { maxRounds: 100 });
 lastTree = mounted.value; mounted.unmount(); expect(pending).toHaveLength(0); return nodes;
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

it("reports unsaved selection until a saved editor is reloaded", async () => {
 const progress = vi.fn();
 api.get.mockResolvedValueOnce(editor()).mockResolvedValue({ ...editor(), snapshot: { ...editor().snapshot, seeds: [seed("a"), seed("b")] }, availableAssets: [seed("a"), seed("b")] });
 await run([rights, file, (n) => expect(words(n)).toContain("ready"), press("Save pool")], progress);
 expect(progress).toHaveBeenCalledWith({ busy: false, dirty: true });
 expect(progress).toHaveBeenCalledWith({ busy: false, dirty: false });
});

// D-C2-1 (RUBRIC Theme C unit 2): the pool used to render as bare HTML inside the designed Profile page — plain-text
// buttons, a native "Choose Files" input, unstyled headings. These pin the app's own primitives on every control and
// that every string the editor showed before is still shown. Layout is not computed in this node environment; the
// 320 px check is in docs/handoff/upload-abstract/checkpoints/C-w5-seed-ui-tz.md.
describe("the seed pool wears the app's primitives (D-C2-1)", () => {
 const TOUCH_FLOOR = "[@media(hover:none)]:min-h-11";
 const classesOf = (tag: string) => (/\bclass="([^"]*)"/.exec(tag)?.[1] ?? "").split(/\s+/).filter(Boolean);
 const buttonTag = (html: string, label: string) => (html.match(/<button\b[^>]*>[^<]*<\/button>/g) ?? []).find((tag) => tag.endsWith(`>${label}</button>`)) ?? "";
 const tagWith = (html: string, pattern: RegExp) => html.match(pattern)?.[0] ?? "";
 const textOf = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
 async function fullEditor() {
  api.get.mockResolvedValue({ ...editor(), pending: { version: "v2", effectiveLocalDate: "2026-11-02", seeds: [seed("a")], revocationGeneration: 0 }, cleanupPending: [{ id: "revoked-id" }] });
  api.upload.mockResolvedValueOnce(seed("b")).mockRejectedValueOnce(new Error("This PDF has no readable text."));
  await run([rights, (n) => change(n.find((x) => x.type === "input" && x.props.type === "file")!, { target: { files: [new File(["%PDF"], "one.pdf", { type: "application/pdf" }), new File(["%PDF"], "two.pdf", { type: "application/pdf" })], value: "x" } }), (n) => expect(words(n)).toContain("two.pdf: failed"), press("Forget this PDF and its recommendations")]);
  return renderToStaticMarkup(lastTree as ReactElement);
 }

 it("draws Save pool as the primary pill and the secondary actions as soft pills, all 44 px on touch", async () => {
  const html = await fullEditor();
  const save = classesOf(buttonTag(html, "Save pool"));
  expect(save).toEqual(expect.arrayContaining(["rounded-full", "bg-accent", "text-bg", TOUCH_FLOOR]));
  for (const label of ["Undo pending changes", "Retry file cleanup 1"]) {
   const classes = classesOf(buttonTag(html, label));
   expect(classes, label).toEqual(expect.arrayContaining(["rounded-full", "bg-bg-secondary/60", TOUCH_FLOOR]));
   expect(classes, label).not.toContain("bg-accent");
  }
 });

 it("draws Forget as the quiet destructive text action and its second step as the Profile's Confirm / Cancel", async () => {
  const html = await fullEditor();
  const forget = classesOf(buttonTag(html, "Forget this PDF and its recommendations"));
  expect(forget).toEqual(expect.arrayContaining(["underline", "hover:text-red", "text-text-muted", TOUCH_FLOOR]));
  expect(forget).not.toContain("bg-accent");
  expect(classesOf(buttonTag(html, "Confirm forget"))).toEqual(expect.arrayContaining(["text-red", "font-medium", TOUCH_FLOOR]));
  expect(classesOf(buttonTag(html, "Cancel"))).toEqual(expect.arrayContaining(["text-text-faint", TOUCH_FLOOR]));
  // A text action keeps a mouse's box the height of its words: no height outside hover:none.
  for (const label of ["Forget this PDF and its recommendations", "Confirm forget", "Cancel"]) {
   for (const cls of classesOf(buttonTag(html, label))) if (/(^|:)(min-h|h)-/.test(cls)) expect(cls.startsWith("[@media(hover:none)]:"), cls).toBe(true);
  }
 });

 it("replaces the native file picker with an Add PDFs pill whose hidden input is still focusable and named", async () => {
  const html = await fullEditor();
  const label = tagWith(html, /<label\b[^>]*>Add PDFs <input\b[^>]*\/?>/);
  expect(label).not.toBe("");
  expect(classesOf(label)).toEqual(expect.arrayContaining(["rounded-full", "bg-accent-dim", "text-accent", TOUCH_FLOOR, "has-[:focus-visible]:outline-2"]));
  const input = tagWith(label, /<input\b[^>]*\/?>/);
  expect(classesOf(input)).toContain("sr-only");
  expect(input).toContain('type="file"');
  expect(input).not.toContain("tabindex");
  expect(input).not.toMatch(/\bhidden\b/);
 });

 it("marks a failed file in the error colour and a ready one apart from it", async () => {
  const html = await fullEditor();
  const failed = tagWith(html, /<li\b[^>]*data-status="failed"[^>]*>/);
  const ready = tagWith(html, /<li\b[^>]*data-status="ready"[^>]*>/);
  expect(classesOf(failed)).toContain("text-red");
  expect(classesOf(ready)).not.toContain("text-red");
  expect(classesOf(ready)).toContain("text-[color:var(--color-positive)]");
 });

 it("labels each section with the eyebrow heading, styles the checkboxes, and keeps long words inside 320 px", async () => {
  const html = await fullEditor();
  for (const heading of ["Active today", "Pending"]) expect(classesOf(tagWith(html, new RegExp(`<h3\\b[^>]*>${heading}</h3>`))), heading).toContain("eyebrow");
  expect(classesOf(tagWith(html, /<legend\b[^>]*>/))).toContain("eyebrow");
  expect(classesOf(tagWith(html, /<fieldset\b[^>]*>/))).toContain("min-w-0");
  const boxes = html.match(/<input\b[^>]*type="checkbox"[^>]*\/?>/g) ?? [];
  expect(boxes.length).toBe(3);
  for (const box of boxes) expect(classesOf(box)).toContain("accent-[color:var(--color-accent)]");
  expect(html).toContain("wrap-anywhere");
 });

 it("keeps every string the editor showed before", async () => {
  const text = textOf(await fullEditor());
  for (const s of [
   "Optional: choose 3–5 distinct papers that represent your interests. One to five works. These private PDFs are separate from your reading uploads; no AI report is created.",
   "Without seed papers, your briefing uses your other preferences. Seed matching is an initial approach, not a quality guarantee.",
   "Active today", "2026-11-01 · America/Chicago", "Pending", "Effective 2026-11-02 · America/Chicago", "Undo pending changes",
   "Next pool (2/5)", "Removing a paper here changes the next pool; it is not a dislike and does not delete the PDF.",
   "Paper a", "Topic: soil", "Research object: roots", "Methods: imaging", "Forget this PDF and its recommendations",
   "Permanently forget this seed PDF and its derived recommendations? Notes and your reading library will not be deleted.",
   "Confirm forget", "Cancel", "I have the right to upload these PDFs for private processing.", "Add PDFs",
   "one.pdf: ready", "two.pdf: failed — This PDF has no readable text.", "Save pool",
   "Recommendation use has been revoked for 1 paper. File cleanup is pending.", "Retry file cleanup 1",
  ]) expect(text, s).toContain(s);
 });

 it("styles the signed-out sign-in buttons and the unavailable state's Retry as pills", async () => {
  account.authOutcome = "signed-out"; account.authUserId = null;
  const out = renderToStaticMarkup(SeedPool({}) as ReactElement);
  for (const label of ["Sign in with Google", "Sign in with GitHub"]) expect(classesOf(buttonTag(out, label)), label).toEqual(expect.arrayContaining(["rounded-full", "bg-surface", TOUCH_FLOOR]));
  expect(textOf(out)).toContain("Sign in to add seed papers. You can skip this optional step.");
  api.get.mockRejectedValue(new Error("down"));
  const failed = await hookRuntime.mount(() => OwnerSeedPool({}));
  const html = renderToStaticMarkup(failed.value as ReactElement);
  failed.unmount();
  expect(textOf(html)).toContain("Seed papers are unavailable. Try again.");
  expect(classesOf(buttonTag(html, "Retry"))).toEqual(expect.arrayContaining(["rounded-full", TOUCH_FLOOR]));
 });
});
