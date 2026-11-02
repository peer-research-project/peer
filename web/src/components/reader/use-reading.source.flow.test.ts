import { afterEach, expect, it, vi } from "vitest";
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  const { hookRuntime } = await import("@/test-support/hook-runtime");
  return { ...actual, ...hookRuntime.hooks };
});
import { hookRuntime } from "@/test-support/hook-runtime";
import { buildReading } from "@/lib/papers/reading";
import type { Paper } from "@/types";
import { useReading } from "./use-reading";
const paper = { id: "openalex:W1", title: "Invented", authors: [], relevanceReason: "", venue: "", source: "other", summaryIntro: "The sample is blue.", summaryExperimentKeywords: [], summaryResultDiscussion: "", isSaved: false } as Paper;
afterEach(() => vi.unstubAllGlobals());
it("rejects a stale server reading and never caches it under the new source", async () => {
  const entries = new Map<string, string>();
  const storage = { getItem: (k: string) => entries.get(k) ?? null, setItem: (k: string, v: string) => entries.set(k, v), removeItem: (k: string) => entries.delete(k) };
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("localStorage", storage);
  const stale = buildReading({ ...paper, summaryIntro: "" }, null);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => stale, headers: new Headers() })));
  const mounted = await hookRuntime.mount(() => useReading(paper));
  expect(mounted.value.fromServer).toBe(false);
  expect(mounted.value.reading?.abstract.sentences.join(" ")).toContain("sample is blue");
  expect(entries.has("peer-reading-v4")).toBe(false);
  mounted.unmount();
});
