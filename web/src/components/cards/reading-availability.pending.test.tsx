import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  const { stagedRuntime } = await import("@/test-support/staged-runtime");
  return { ...actual, ...stagedRuntime.hooks, useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get() };
});

import { stagedRuntime } from "@/test-support/staged-runtime";
import { buildReading } from "@/lib/papers/reading";
import { markFullTextPending } from "@/lib/papers/full-text-pending";
import { buildReadingKey, fingerprintReadingSource, readCached } from "@/components/reader/use-reading";
import type { Paper } from "@/types";
import { ReadingAvailability } from "./reading-availability";

const paper = (id: string): Paper => ({ id, revision: 1, title: "An invented paper", authors: [], relevanceReason: "", venue: "", source: "other", summaryIntro: "An invented abstract", summaryExperimentKeywords: [], summaryResultDiscussion: "", isSaved: false });
const response = (p: Paper, kind: "pending" | "readable") => {
  const base = buildReading(p, null);
  const reading = kind === "pending" ? markFullTextPending(base) : { ...base, provenance: { ...base.provenance, fullText: "pdf" as const }, body: [{ id: "s1", heading: "Methods", paragraphs: ["Readable scientific text about invented work. ".repeat(12)] }] };
  return new Response(JSON.stringify(reading), { headers: { "X-Peer-Readability": kind === "pending" ? "unknown" : "readable" } });
};
function storage(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, clear: () => values.clear(), getItem: (key) => values.get(key) ?? null, key: (i) => [...values.keys()][i] ?? null, removeItem: (key) => void values.delete(key), setItem: (key, value) => void values.set(key, value) };
}
function open(p: Paper) {
  const mounted = stagedRuntime.mount(() => ReadingAvailability({ paper: p }));
  stagedRuntime.flush();
  return mounted;
}
function text(p: Paper) {
  return stagedRuntime.mount(() => ReadingAvailability({ paper: p })).value.props.children;
}

describe("briefing availability while the source is still being read", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", storage());
    vi.stubGlobal("window", globalThis);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("keeps checking a pending source and caches the finished reading", async () => {
    const current = paper("invented:pending-success");
    const fetcher = vi.fn().mockResolvedValueOnce(response(current, "pending")).mockResolvedValueOnce(response(current, "readable"));
    vi.stubGlobal("fetch", fetcher);
    open(current);
    await vi.advanceTimersByTimeAsync(0);
    expect(text(current)).toBe("Checking full text…");
    expect(readCached(buildReadingKey(current.id, current.fullTextUploadId, current.revision, fingerprintReadingSource(current)))).toBeNull();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(text(current)).toBe("Read in Peer");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(readCached(buildReadingKey(current.id, current.fullTextUploadId, current.revision, fingerprintReadingSource(current)))?.provenance.fullText).toBe("pdf");
  });

  it("stops after bounded pending retries and offers a manual retry", async () => {
    const current = paper("invented:pending-timeout");
    const fetcher = vi.fn(async () => response(current, "pending"));
    vi.stubGlobal("fetch", fetcher);
    open(current);
    await vi.advanceTimersByTimeAsync(14_000);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(text(current)).toBe("Couldn’t check · Retry");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("does not automatically retry a settled unknown, but the reader can retry it", async () => {
    const current = paper("invented:source-unavailable");
    const unknown = new Response(JSON.stringify(buildReading(current, null)), { headers: { "X-Peer-Readability": "unknown" } });
    const fetcher = vi.fn().mockResolvedValueOnce(unknown).mockResolvedValueOnce(response(current, "readable"));
    vi.stubGlobal("fetch", fetcher);
    open(current);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const button = stagedRuntime.mount(() => ReadingAvailability({ paper: current })).value;
    expect(button.props.children).toBe("Couldn’t check · Retry");
    button.props.onClick({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][0]).toContain("&refresh=1");
    expect(text(current)).toBe("Read in Peer");
  });

  it("releases a network slot while a pending paper waits to be retried", async () => {
    const first = paper("invented:pending-slot1");
    const second = paper("invented:pending-slot2");
    const third = paper("invented:pending-slot3");
    let releaseFirst!: (value: Response) => void;
    let releaseSecond!: (value: Response) => void;
    const fetcher = vi.fn((url: string) => {
      if (url.includes(encodeURIComponent(first.id))) return new Promise<Response>((resolve) => { releaseFirst = resolve; });
      if (url.includes(encodeURIComponent(second.id))) return new Promise<Response>((resolve) => { releaseSecond = resolve; });
      return Promise.resolve(response(third, "readable"));
    });
    vi.stubGlobal("fetch", fetcher);
    open(first); open(second); open(third);
    expect(fetcher).toHaveBeenCalledTimes(2);
    releaseFirst(response(first, "pending"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[2][0]).toContain(encodeURIComponent(third.id));
    releaseSecond(response(second, "readable"));
    await vi.advanceTimersByTimeAsync(0);
    fetcher.mockImplementation(async () => response(first, "readable"));
    await vi.advanceTimersByTimeAsync(2_000);
  });
});
