import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  const { stagedRuntime } = await import("@/test-support/staged-runtime");
  return { ...actual, ...stagedRuntime.hooks, useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get() };
});

import { stagedRuntime } from "@/test-support/staged-runtime";
import { buildReading } from "@/lib/papers/reading";
import { markFullTextPending } from "@/lib/papers/full-text-pending";
import type { Paper } from "@/types";
import { ReadingAvailability } from "./reading-availability";

const paper = (id: string): Paper => ({ id, revision: 1, title: "An invented paper", authors: [], relevanceReason: "", venue: "", source: "other", summaryIntro: "An invented abstract", summaryExperimentKeywords: [], summaryResultDiscussion: "", isSaved: false });
function response(p: Paper, kind: "pending" | "readable"): Response {
  const base = buildReading(p, null);
  const reading = kind === "pending" ? markFullTextPending(base) : { ...base, provenance: { ...base.provenance, fullText: "pdf" as const }, body: [{ id: "s1", heading: "Methods", paragraphs: ["Readable scientific text about invented work. ".repeat(12)] }] };
  return new Response(JSON.stringify(reading), { headers: { "X-Peer-Readability": kind === "pending" ? "unknown" : "readable" } });
}
function storage(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, clear: () => values.clear(), getItem: (key) => values.get(key) ?? null, key: (i) => [...values.keys()][i] ?? null, removeItem: (key) => void values.delete(key), setItem: (key, value) => void values.set(key, value) };
}

describe("availability when a card's paper changes", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("localStorage", storage()); vi.stubGlobal("window", globalThis); });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("keeps the pending retry for a new object with the same key and uses that latest object", async () => {
    let current = paper("invented:same-key-update");
    const fetcher = vi.fn().mockResolvedValueOnce(response(current, "pending")).mockResolvedValueOnce(response(current, "readable"));
    vi.stubGlobal("fetch", fetcher);
    const mounted = stagedRuntime.mount(() => ReadingAvailability({ paper: current }));
    stagedRuntime.flush();
    await vi.advanceTimersByTimeAsync(0);
    const abstract = current.summaryIntro;
    const readLatest = vi.fn(() => abstract);
    current = { ...current, get summaryIntro() { return readLatest(); } };
    stagedRuntime.rerender(); stagedRuntime.flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    readLatest.mockClear();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(readLatest).toHaveBeenCalled();
    stagedRuntime.rerender();
    expect(mounted.value.props.children).toBe("Read in Peer");
    mounted.unmount();
  });

  it("cancels the old key's retry when the card changes to a different paper", async () => {
    const old = paper("invented:old-key-update");
    const next = paper("invented:new-key-update");
    let current = old;
    const fetcher = vi.fn().mockResolvedValueOnce(response(old, "pending")).mockResolvedValueOnce(response(next, "readable"));
    vi.stubGlobal("fetch", fetcher);
    const mounted = stagedRuntime.mount(() => ReadingAvailability({ paper: current }));
    stagedRuntime.flush();
    await vi.advanceTimersByTimeAsync(0);
    current = next;
    stagedRuntime.rerender(); stagedRuntime.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    stagedRuntime.rerender();
    expect(mounted.value.props.children).toBe("Read in Peer");
    mounted.unmount();
  });
});
