import { afterEach, expect, it, vi } from "vitest";
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  const { hookRuntime } = await import("@/test-support/hook-runtime");
  return { ...actual, ...hookRuntime.hooks };
});
import { useEffect, useState } from "react";
import { hookRuntime } from "@/test-support/hook-runtime";
import { buildReading } from "@/lib/papers/reading";
import type { Paper } from "@/types";
import { readingIdentityStorageKey } from "@/lib/papers/reading-identity";
import { buildReadingKey, fingerprintReadingSource, useReading } from "./use-reading";
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
  expect(entries.get(readingIdentityStorageKey(paper.id))).toBe(buildReadingKey(paper.id, undefined, undefined, fingerprintReadingSource(paper)));
  mounted.unmount();
});

it("does not let an earlier in-flight source replace a changed source", async () => {
  const entries = new Map<string, string>();
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("localStorage", { getItem: (k: string) => entries.get(k) ?? null, setItem: (k: string, v: string) => entries.set(k, v), removeItem: (k: string) => entries.delete(k) });
  const old = { ...paper, summaryIntro: "The old sample is red." };
  const fetcher = vi.fn(async (url: string) => {
    void url;
    const answer = old;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { ok: true, json: async () => buildReading(answer, null), headers: new Headers() };
  });
  vi.stubGlobal("fetch", fetcher);
  const mounted = await hookRuntime.mount(() => {
    const [current, setCurrent] = useState(old);
    const result = useReading(current);
    useEffect(() => { setTimeout(() => setCurrent(paper), 0); }, []);
    return result;
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(mounted.value.fromServer).toBe(false);
  expect(mounted.value.reading?.abstract.sentences.join(" ")).toContain("sample is blue");
  const cache = JSON.parse(entries.get("peer-reading-v4") ?? "{}");
  expect(cache[buildReadingKey(paper.id, undefined, undefined, fingerprintReadingSource(paper))]).toBeUndefined();
  mounted.unmount();
});
