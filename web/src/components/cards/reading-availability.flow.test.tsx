import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  const { hookRuntime } = await import("@/test-support/hook-runtime");
  return { ...actual, ...hookRuntime.hooks, useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get() };
});
import { hookRuntime } from "@/test-support/hook-runtime";
import { buildReading } from "@/lib/papers/reading";
import { buildReadingKey, fingerprintReadingSource, readCached, rememberReading, useReading } from "@/components/reader/use-reading";
import type { Paper } from "@/types";
import { ReadingAvailability } from "./reading-availability";

const paper = (id: string, summaryIntro: string): Paper => ({ id, revision: 1, title: "An invented paper", authors: [], relevanceReason: "", venue: "", source: "other", summaryIntro, summaryExperimentKeywords: [], summaryResultDiscussion: "", isSaved: false });
const keyOf = (p: Paper) => buildReadingKey(p.id, p.fullTextUploadId, p.revision, fingerprintReadingSource(p));
const readable = (p: Paper) => ({ ...buildReading(p, null), provenance: { ...buildReading(p, null).provenance, fullText: "pdf" as const }, body: [{ id: "s1", heading: "Methods", paragraphs: ["Readable scientific text about invented work. ".repeat(12)] }] });
const answer = (p: Paper) => new Response(JSON.stringify(readable(p)), { headers: { "X-Peer-Readability": "readable" } });
function memoryStorage(): Storage {
 const map = new Map<string, string>();
 return { get length() { return map.size; }, clear: () => map.clear(), getItem: (key) => map.get(key) ?? null, key: (i) => [...map.keys()][i] ?? null, removeItem: (key) => void map.delete(key), setItem: (key, value) => void map.set(key, String(value)) };
}
const mountedCards: Array<{ unmount: () => void }> = [];
async function open(p: Paper) { const mounted = await hookRuntime.mount(() => ReadingAvailability({ paper: p })); mountedCards.push(mounted); return mounted.value; }
const textOf = (value: ReturnType<typeof ReadingAvailability>) => value.props.children;
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
beforeEach(() => { vi.stubGlobal("localStorage", memoryStorage()); vi.stubGlobal("window", globalThis); });
afterEach(() => { mountedCards.splice(0).forEach((mounted) => mounted.unmount()); vi.unstubAllGlobals(); });

describe("availability uses the current source identity", () => {
 it("rejects a forged response identity without caching or showing readable", async () => {
  const p = paper("invented:forged", "Current abstract");
  const other = { ...p, summaryIntro: "Different abstract" };
  const fetcher = vi.fn(async (url: string) => { void url; return answer(other); }); vi.stubGlobal("fetch", fetcher);
  await open(p); await settle();
  expect(textOf(await open(p))).toBe("Couldn’t check · Retry");
  expect(readCached(keyOf(p))).toBeNull();
  expect(fetcher.mock.calls[0][0]).toContain(`&sf=1&source=${fingerprintReadingSource(p)}`);
 });
 it("prefetches a valid reading that the reader can consume", async () => {
  const p = paper("invented:valid", "Verified abstract");
  const fetcher = vi.fn(async () => answer(p)); vi.stubGlobal("fetch", fetcher);
  await open(p); await settle();
  expect(textOf(await open(p))).toBe("Read in Peer");
  expect(readCached(keyOf(p))?.sourceFingerprint).toBe(fingerprintReadingSource(p));
  const mounted = await hookRuntime.mount(() => useReading(p));
  expect(mounted.value.fromServer).toBe(true); expect(fetcher).toHaveBeenCalledTimes(1); mounted.unmount();
 });
 it("does not reuse a cached reading with a forged fingerprint", async () => {
  const p = paper("invented:badcache", "Current abstract");
  rememberReading(keyOf(p), readable({ ...p, summaryIntro: "Other abstract" }) as never);
  const fetcher = vi.fn(async () => answer({ ...p, summaryIntro: "Other abstract" })); vi.stubGlobal("fetch", fetcher);
  await open(p); await settle();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(textOf(await open(p))).toBe("Couldn’t check · Retry");
 });
 it("keeps late old-source responses out of the new source state and cache", async () => {
  const old = paper("invented:changed", "Old source"); const current = { ...old, summaryIntro: "New source" };
  let releaseOld!: (value: Response) => void; let releaseCurrent!: (value: Response) => void;
  const fetcher = vi.fn((url: string) => url.includes(`source=${fingerprintReadingSource(old)}`) ? new Promise<Response>((resolve) => { releaseOld = resolve; }) : new Promise<Response>((resolve) => { releaseCurrent = resolve; }));
  vi.stubGlobal("fetch", fetcher);
  await open(old); await open(current);
  releaseOld(answer(old)); await settle();
  expect(textOf(await open(current))).toBe("Checking full text…");
  expect(readCached(keyOf(current))).toBeNull();
  releaseCurrent(answer(current)); await settle();
  expect(textOf(await open(current))).toBe("Read in Peer");
  expect(readCached(keyOf(current))?.sourceFingerprint).toBe(fingerprintReadingSource(current));
  expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it("keeps at most two prefetches active", async () => {
  const papers = [paper("invented:limit1", "First"), paper("invented:limit2", "Second"), paper("invented:limit3", "Third")];
  const releases: Array<(value: Response) => void> = [];
  const fetcher = vi.fn(() => new Promise<Response>((resolve) => { releases.push(resolve); }));
  vi.stubGlobal("fetch", fetcher);
  await open(papers[0]); await open(papers[1]); await open(papers[2]);
  expect(fetcher).toHaveBeenCalledTimes(2);
  releases[0](answer(papers[0])); await settle();
  expect(fetcher).toHaveBeenCalledTimes(3);
  releases[1](answer(papers[1])); releases[2](answer(papers[2])); await settle();
 });

});
