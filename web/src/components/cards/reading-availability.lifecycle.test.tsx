import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ runEffects: false, cleanup: undefined as (() => void) | undefined }));
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => { if (hooks.runEffects) hooks.cleanup = effect() || undefined; },
    useRef: <T,>(value: T) => ({ current: value }),
    useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get(),
  };
});

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
const cards: Array<{ unmount: () => void }> = [];
function open(p: Paper) {
  hooks.runEffects = true;
  hooks.cleanup = undefined;
  const value = ReadingAvailability({ paper: p });
  const cleanup = hooks.cleanup as (() => void) | undefined;
  hooks.runEffects = false;
  let closed = false;
  const card = { value, unmount: () => { if (!closed) { closed = true; cleanup?.(); } } };
  cards.push(card);
  return card;
}
function label(p: Paper) { return ReadingAvailability({ paper: p }).props.children; }

describe("briefing prefetch lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", storage());
    vi.stubGlobal("window", globalThis);
  });
  afterEach(() => { cards.splice(0).forEach((card) => card.unmount()); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("cancels a delayed retry after the last card unmounts and checks again when it returns", async () => {
    const p = paper("invented:unmounted-wait");
    const fetcher = vi.fn().mockResolvedValueOnce(response(p, "pending")).mockResolvedValueOnce(response(p, "readable"));
    vi.stubGlobal("fetch", fetcher);
    const card = open(p);
    await vi.advanceTimersByTimeAsync(0);
    expect(label(p)).toBe("Checking full text…");
    card.unmount();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    open(p);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(label(p)).toBe("Read in Peer");
  });

  it("shares one check across mounts and keeps retrying while any matching card remains", async () => {
    const p = paper("invented:shared-mounted");
    const fetcher = vi.fn().mockResolvedValueOnce(response(p, "pending")).mockResolvedValueOnce(response(p, "readable"));
    vi.stubGlobal("fetch", fetcher);
    const first = open(p);
    open(p);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    first.unmount();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(label(p)).toBe("Read in Peer");
  });

  it("does not retry or keep a late pending answer after an in-flight card unmounts", async () => {
    const p = paper("invented:unmounted-flight");
    let release!: (value: Response) => void;
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; })).mockResolvedValueOnce(response(p, "readable"));
    vi.stubGlobal("fetch", fetcher);
    const card = open(p);
    card.unmount();
    release(response(p, "pending"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    open(p);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(label(p)).toBe("Read in Peer");
  });

  it("reuses a still-running request when the same card returns", async () => {
    const p = paper("invented:returns-in-flight");
    let release!: (value: Response) => void;
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; })).mockResolvedValueOnce(response(p, "readable"));
    vi.stubGlobal("fetch", fetcher);
    const card = open(p);
    card.unmount();
    open(p);
    expect(fetcher).toHaveBeenCalledTimes(1);
    release(response(p, "pending"));
    await vi.advanceTimersByTimeAsync(0);
    expect(label(p)).toBe("Checking full text…");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(label(p)).toBe("Read in Peer");
  });

  it("removes an unmounted card from the queue before its request starts", async () => {
    const first = paper("invented:queued-first");
    const second = paper("invented:queued-second");
    const third = paper("invented:queued-third");
    const releases: Array<(value: Response) => void> = [];
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => { releases.push(resolve); }));
    vi.stubGlobal("fetch", fetcher);
    open(first); open(second);
    const card = open(third);
    expect(fetcher).toHaveBeenCalledTimes(2);
    card.unmount();
    releases[0](response(first, "readable"));
    releases[1](response(second, "readable"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
