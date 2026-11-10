"use client";

import { Fragment, useRef, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { useKeepPlace } from "@/lib/reader/keep-place";
import "./reader-compact.css";
import { fitZoom, READING_SCALE_STEPS, useReadingPrefsStore } from "@/store/reading-prefs";
import { TABPANEL_ID, tabId } from "./reader-tabs";
import { ReaderShell } from "./reader-shell";
import { ReadingControls } from "./reading-controls";
import type { ReaderTab } from "./use-reader-tab";
import { railMinimumWidth } from "./pane-layout";
import { ResponsiveMargin } from "./responsive-margin";

/** The id of the wrapper that holds the blocks both tabs share. */
export const COMMON_ID = "reader-common";

/**
 * Where a tab the reader picks starts, once its blocks are on the page: the page goes there only if it has
 * scrolled off the top. In the panes (the spread) the centre opens with the common blocks, so that is the start (the
 * tabpanel when there are none). In one column (P9-04, X3) the common blocks stand ABOVE the strip and the
 * panel directly below it, so the start is the panel — `scroll-mt-20` leaves the strip in view above it —
 * and never the common blocks: a pick made at the strip must not throw the page back up to them.
 * `doc` is the document (a stub in the tests).
 */
export function scrollToTabStart(spread: boolean, doc: Pick<Document, "getElementById">): void {
  const start = (spread ? doc.getElementById(COMMON_ID) : null) ?? doc.getElementById(TABPANEL_ID);
  if (start && start.getBoundingClientRect().top < 0) start.scrollIntoView({ block: "start" });
}

interface ReaderLayoutProps {
  /** From `useSpread()`; the page owns it so its own effects can depend on it. */
  spread: boolean;
  plate: ReactNode;
  title: ReactNode;
  /** Actions follow the title in both layouts. */
  decision: ReactNode;
  /** Bibliography, access details and the DOI. */
  details?: ReactNode;
  /** Report generation status, when present. */
  progress?: ReactNode;
  /** Summary / Paper digestion switch when a full body is available. */
  tabs?: ReactNode;
  /** Explain why book view is unavailable when the paper has no full text. */
  bookHint?: ReactNode;
  /** The paper outline, outside the tab panel in both layouts. */
  map?: ReactNode;
  /** The tab on show, for the tabpanel's label. */
  tab?: ReaderTab;
  /** The blocks both tabs share ("Before you read" and the answers), above the
   *  active tab's blocks in the column. Q6: one state, never remounted by a tab. */
  common?: ReactNode;
  words: ReactNode;
  additions: ReactNode;
  next: ReactNode;
}

/**
 * Comfortable room for a rail, text and margin at the current reading step. Safe to read on the first render: `Reader` mounts
 * only once the paper is known, which is after `StoreHydrator` rehydrates
 * (all stores are `skipHydration`) or after the by-id fetch — never during
 * SSR or hydration. The server snapshot is the one-column page regardless.
 */
export function useSpread(): boolean {
  const readingScale = useResolvedReadingScale();
  const width = useSyncExternalStore(subscribeResize, () => document.documentElement.clientWidth, () => 0);
  return width >= railMinimumWidth(readingScale);
}

function subscribeResize(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

/**
 * S20: unconditionally the reader's own ladder step — Ruling 19 (round 7,
 * second pass) makes Fit a separate, composing whole-page zoom rather than
 * a different way to pick this same value, so this hook no longer branches
 * on `fit` at all and needs no DOM/viewport access.
 */
export function useResolvedReadingScale(): number {
  const scaleIndex = useReadingPrefsStore((s) => s.scaleIndex);
  return READING_SCALE_STEPS[scaleIndex];
}

/**
 * Ruling 21 (round 7, item 7-07): Fit's whole-page zoom multiplier — 1
 * (no-op) unless Fit is on and the spread applies (Fit has nothing to do
 * below the three panes, per spec). COMPUTED from the viewport width and the reader's
 * own `readingScale` step (`fitZoom`, `store/reading-prefs.ts`) — never
 * measured off a live DOM element any more. The previous version read
 * `[data-zoom-root]`'s own `offsetWidth` as a stand-in for the page's 1x
 * width; A7b-01/A7b-02 (round 7, closing) found that stand-in goes stale
 * after "Larger text"/"Smaller text" while Fit is on (nothing re-triggers a
 * DOM read until an actual window resize) and is not zoom-invariant once
 * the zoomed element is clamped by `width: 100%` instead of its own
 * `max-width` (the regime the xl breakpoint can enter), so a resize while
 * already fitted could strand the zoom on a self-inconsistent value. Both
 * inputs here are already-known numbers — nothing to go stale, nothing to
 * mis-measure.
 *
 * Subscribed to `window`'s `resize` event via `useSyncExternalStore` (the
 * same shape `useSpread` above already uses for `matchMedia`'s `change`
 * event) and to the reading-prefs store via `useResolvedReadingScale`, so
 * Fit's zoom recomputes immediately on either an A/A click or an actual
 * window resize — not only on the next resize.
 */
export function usePageZoom(): number {
  const fit = useReadingPrefsStore((s) => s.fit);
  const spread = useSpread();
  const readingScale = useResolvedReadingScale();
  const viewportWidth = useSyncExternalStore(subscribeResize, () => window.innerWidth, () => 0);
  if (!fit || !spread) return 1;
  return fitZoom(viewportWidth, readingScale);
}

/** What a zone gives the focus ring (2px + 3px offset) of whatever stands at its edge: a zone clips what overflows it, and a command or a
 *  map row at the edge would lose its ring. The old map had `xl:-mx-1.5 xl:px-1.5` for it. */
const ZONE_INSET = "px-1.5";

export function ReaderLayout(p: ReaderLayoutProps) {
  // P12-15: the owner outlives both structures. Its last stable logical token
  // survives CSS reflow, the temporary shell and native clamp event ordering.
  const owner = useRef<HTMLDivElement | null>(null);
  useKeepPlace(owner, { responsive: true });
  // S15/S21: read here, not threaded as a prop from page.tsx — this file
  // already self-contains its other layout-affecting state (`useSpread`),
  // so the reading-size scale follows the same shape. Sets --reading-scale
  // on a thin wrapper around `words` and `additions` only (never
  // `decision`, never the pane) — the CSS variable falls back to 1
  // everywhere it isn't explicitly set, so nothing outside these two wraps
  // is affected.
  const readingScale = useResolvedReadingScale();
  const readingScaleStyle = { "--reading-scale": readingScale } as CSSProperties;

  const tabbed = p.tabs !== undefined && p.tabs !== null;
  // Built from the slot alone — the tab is not read here, on purpose (see the header).
  const common = p.common ? (
    <div key="common" id={COMMON_ID} className="reading-scaled scroll-mt-20" style={readingScaleStyle}>{p.common}</div>
  ) : null;
  const blocks = (
    <Fragment key="panel">
      <div className="reading-scaled" style={readingScaleStyle}>{p.words}</div>
      <div className="reading-scaled" style={readingScaleStyle}>{p.additions}</div>
    </Fragment>
  );

  const panel = tabbed ? (
    <div key="panel" role="tabpanel" id={TABPANEL_ID} aria-labelledby={p.tab ? tabId(p.tab) : undefined}
      className={p.spread ? "scroll-mt-20 flex flex-col" : "scroll-mt-20 flow-root"}>{blocks}</div>
  ) : blocks;
  const wrap = (children: ReactNode) => (
    <div data-reader-layout="" ref={owner} style={{ display: "contents" }}>
      {children}
    </div>
  );
  // P12-15: the SAME keyed centre ancestry stands in both modes. Removing or
  // reparenting it changes native Range endpoints even when text nodes survive.
  const preamble = (
    <>{p.plate}{p.title}{p.decision}{p.details}{p.progress}<div id="reader-book-toolbar-slot">{p.bookHint}</div></>
  );
  const navigation = (
    <>{p.tabs}{p.map}</>
  );
  return wrap(
    <><ReaderShell
      side={p.spread}
      keepReadingPlace={false}
      left={{ whole: <div className={ZONE_INSET}>{p.map ?? <div className="reader-outline-empty"><span>Contents</span><p>No outline available</p></div>}</div> }}
      centre={
        <div key="reading-content" className={p.spread ? "reader-document" : undefined}>
          {!p.spread ? <Fragment key="preamble">{preamble}</Fragment> : <>
            <div className="reader-document-tools"><ReadingControls spread /></div>
            <div className="reader-document-title">{p.title}</div>
            <div className="reader-document-commands">{p.decision}</div>
            <div className="reader-document-details">{p.details}</div>
            {p.progress}
            <div id="reader-book-toolbar-slot">{p.bookHint}</div>
            {p.tabs}
          </>}
          {common}
          {!p.spread ? <Fragment key="navigation">{navigation}</Fragment> : null}
          {panel}
          {p.spread && p.plate ? <div className="reader-document-figure">{p.plate}</div> : null}
          <div key="next">{p.next}</div>
        </div>
      }
    /><ResponsiveMargin side={p.spread} /></>
  );
}
