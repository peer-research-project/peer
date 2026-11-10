"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Paper } from "@/types";
import type { PaperReading } from "@/lib/papers/reading";
import { isFullTextPending } from "@/lib/papers/full-text-pending";
import { hasReadableText } from "@/lib/papers/readability";
import { buildReadingKey, fingerprintReadingSource, readCached, READING_VERSION, rememberReading } from "@/components/reader/use-reading";

type State = "checking" | "readable" | "abstract" | "unavailable" | "unknown";
const states = new Map<string, { state: State; at: number }>();
const STATE_TTL_MS = 24 * 60 * 60 * 1000;
const setState = (key: string, state: State) => states.set(key, { state, at: Date.now() });
const listeners = new Set<() => void>();
const queued = new Set<string>();
type PaperRef = { current: { paper: Paper; order: number } };
const mounted = new Map<string, Set<PaperRef>>();
let paperOrder = 0;
const activeKeys = new Set<string>();
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
type Task = { key: string; paper: Paper; refresh: boolean; pendingAnswers: number };
const tasks: Task[] = [];
let active = 0;
const MAX_CONCURRENT = 2;
const PENDING_RETRY_DELAYS_MS = [2_000, 4_000, 8_000] as const;
const notify = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

function hasReadableBody(reading: PaperReading): boolean {
  if (reading.provenance?.fullText !== "html" && reading.provenance?.fullText !== "pdf") return false;
  if (!Array.isArray(reading.body)) return false;
  const paragraphs = reading.body.flatMap((section) => Array.isArray(section?.paragraphs) ? section.paragraphs.filter((p) => typeof p === "string") : []);
  return hasReadableText(paragraphs.join(" "));
}

function pump() {
  while (active < MAX_CONCURRENT && tasks.length) {
    const task = tasks.shift()!;
    active++;
    activeKeys.add(task.key);
    void check(task).then((pending) => {
      if (!mounted.has(task.key)) {
        queued.delete(task.key);
        return;
      }
      const delay = PENDING_RETRY_DELAYS_MS[task.pendingAnswers];
      if (pending && delay !== undefined) {
        // Keep the key reserved while waiting, but release the network slot so
        // other cards are not held up by a paper that is still being parsed.
        const timer = setTimeout(() => {
          retryTimers.delete(task.key);
          if (!mounted.has(task.key)) return;
          tasks.push({ ...task, pendingAnswers: task.pendingAnswers + 1 });
          pump();
        }, delay);
        retryTimers.set(task.key, timer);
        return;
      }
      if (pending) {
        setState(task.key, "unknown");
        notify();
      }
      queued.delete(task.key);
    }).finally(() => { active--; activeKeys.delete(task.key); pump(); });
  }
}

async function check({ key, paper, refresh }: Task): Promise<boolean> {
  try {
    // A parent can replace a card's paper object without changing its reading
    // identity. Each retry uses the most recently committed mounted object.
    let mountedPaper: PaperRef["current"] | undefined;
    for (const ref of mounted.get(key) ?? []) {
      if (ref.current.order > (mountedPaper?.order ?? -1)) mountedPaper = ref.current;
    }
    paper = mountedPaper?.paper ?? paper;
    const fingerprint = fingerprintReadingSource(paper);
    const url = `/api/papers/${encodeURIComponent(paper.id)}/reading?v=${READING_VERSION}&availability=1&sf=1&source=${encodeURIComponent(fingerprint)}${paper.fullTextUploadId ? `&upload=${encodeURIComponent(paper.fullTextUploadId)}` : ""}${refresh ? "&refresh=1" : ""}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error("Reading unavailable");
    const availability = res.headers.get("X-Peer-Readability");
    const reading = await res.json() as PaperReading;
    if (!mounted.has(key)) return false;
    if (reading.version !== READING_VERSION || reading.sourceFingerprint !== fingerprint || !reading.provenance) throw new Error("Unexpected reading");
    if (availability === "unknown" && isFullTextPending(reading)) return true;
    if (availability === "readable" && hasReadableBody(reading)) {
      rememberReading(key, reading);
      setState(key, "readable");
    } else if (availability === "abstract") {
      rememberReading(key, reading);
      setState(key, reading.provenance.abstract === "none" ? "unavailable" : "abstract");
    } else {
      setState(key, "unknown");
    }
  } catch {
    if (!mounted.has(key)) return false;
    setState(key, "unknown");
  }
  notify();
  return false;
}

function unmount(key: string, paperRef: PaperRef) {
  const refs = mounted.get(key);
  refs?.delete(paperRef);
  if (refs?.size) return;
  mounted.delete(key);
  const timer = retryTimers.get(key);
  if (timer !== undefined) clearTimeout(timer);
  retryTimers.delete(key);
  for (let i = tasks.length - 1; i >= 0; i--) {
    if (tasks[i].key === key) tasks.splice(i, 1);
  }
  // An in-flight fetch still owns its reservation until it settles; a new
  // mount can share that fetch without starting a duplicate.
  if (!activeKeys.has(key)) queued.delete(key);
  if (states.get(key)?.state === "checking") states.delete(key);
}

function schedule(paper: Paper, refresh = false) {
  const key = buildReadingKey(paper.id, paper.fullTextUploadId, paper.revision, fingerprintReadingSource(paper));
  const existing = states.get(key);
  if (queued.has(key)) return;
  const cached = readCached(key);
  if (!refresh && cached && cached.sourceFingerprint === fingerprintReadingSource(paper) && hasReadableBody(cached)) {
    setState(key, "readable");
    notify();
    return;
  }
  if (!refresh && existing && Date.now() - existing.at < STATE_TTL_MS) return;
  setState(key, "checking");
  queued.add(key);
  tasks.push({ key, paper, refresh, pendingAnswers: 0 });
  notify();
  pump();
}

const labels: Record<State, string> = {
  checking: "Checking full text…",
  readable: "Read in Peer",
  abstract: "Abstract only",
  unavailable: "Full text unavailable",
  unknown: "Couldn’t check · Retry",
};

export function ReadingAvailability({ paper }: { paper: Paper }) {
  const key = buildReadingKey(paper.id, paper.fullTextUploadId, paper.revision, fingerprintReadingSource(paper));
  const state = useSyncExternalStore<State>(subscribe, () => states.get(key)?.state ?? "checking", () => "checking");
  const paperRef = useRef({ paper, order: 0 });
  useEffect(() => {
    paperRef.current = { paper, order: ++paperOrder };
  }, [paper]);
  useEffect(() => {
    const refs = mounted.get(key) ?? new Set<PaperRef>();
    refs.add(paperRef);
    mounted.set(key, refs);
    schedule(paperRef.current.paper);
    return () => unmount(key, paperRef);
  }, [key]);
  if (state === "unknown") {
    return <button type="button" className="reading-availability reading-availability-retry" onClick={(event) => { event.preventDefault(); event.stopPropagation(); schedule(paper, true); }} aria-label="Couldn’t check full text. Try again.">{labels[state]}</button>;
  }
  return <span className={`reading-availability reading-availability-${state}`}>{labels[state]}</span>;
}
