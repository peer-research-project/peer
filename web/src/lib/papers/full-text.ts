import { publicFetch } from "@/lib/security/public-fetch";
// Full-text orchestrator for deep paper reports.
//
// Given a paper identifier, walks the prioritized source-link list and
// returns the first source that yields useful sectioned text. HTML hosts
// (ar5iv, PMC, bioRxiv, OA publishers) are tried first because their text
// is cleaner and cheaper to parse than PDF. PDF is the fallback.
//
// Output is cached per paper for 1 hour so repeated report renders / figure
// binding share the same fetch. A private upload is never in that shared
// cache: its text is kept for its owner alone (`uploadFullText`, P0-02).

import {
  chooseHtmlExtractor,
  looksLikeFullText,
  type ExtractedDocument,
} from "./html-text";
import { readabilityOf } from "./readability";
import { classifyHardAccessStatus } from "./paywall-status";
import { extractPdfTextFromBytes, tryExtractPdfText } from "./pdf-text";
import { collectSourceLinks, type SourceLink } from "./source-links";
import { bareUploadId, claimsUploadId, readUploadDoc, readUploadPdf, uploadDocKey, writeUploadDoc, type UploadMeta } from "./upload-store";
import { ownedUpload } from "./upload-access";
import { UPLOAD_CONCEPT_EXTRACTION_VERSION } from "@/lib/preferences/upload-concepts";

const FETCH_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 4_000_000;
const CACHE_TTL_MS = 60 * 60 * 1000;

export interface FullTextInput {
  paperId: string;
  url?: string | null;
  doi?: string | null;
  arxivId?: string | null;
  openAlexId?: string | null;
}

export type FullTextStatus =
  | "ok"
  | "paywalled"
  | "no_full_text"
  | "source_unavailable";

export interface FullTextResult {
  status: FullTextStatus;
  /** The extracted document — only populated when status === "ok". */
  doc?: ExtractedDocument;
  /** Which source link supplied the document. */
  sourceLink?: SourceLink;
  /** Human-readable reason for non-ok statuses (used in paywall banner). */
  reason?: string;
  /** Every link we tried, for telemetry / debugging. */
  attempts: Array<{ link: SourceLink; outcome: string; finalUrl?: string }>;
}

interface CachedResult {
  result: FullTextResult;
  ts: number;
}

const cache = new Map<string, Promise<FullTextResult> | CachedResult>();

const PAYWALL_PHRASES = [
  "purchase access",
  "buy this article",
  "subscribe to continue",
  "subscription required",
  "preview of subscription content",
  "rent this article",
  "subscribe for full access",
];

function appearsPaywalled(html: string): boolean {
  const lowered = html.toLowerCase();
  const hasPaywallPhrase = PAYWALL_PHRASES.some((p) => lowered.includes(p));
  const looksOpen = /creative commons|cc-by|free full text|open access/i.test(html);
  return hasPaywallPhrase && !looksOpen;
}

async function fetchHtml(url: string): Promise<{ ok: true; html: string; finalUrl: string; res: Response } | { ok: false; reason: string; isPdf?: boolean; status?: number; finalUrl?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await publicFetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "User-Agent": "PeerBot/0.1 (+https://peer.research)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) return { ok: false, reason: `Fetch returned ${res.status}`, status: res.status, finalUrl: res.url || url };

    const contentType = res.headers.get("content-type") ?? "";
    // Some PDF links serve directly when the URL looks HTML — let the PDF
    // path handle them by signalling no-HTML here.
    if (/pdf/i.test(contentType)) return { ok: false, reason: "Server returned PDF, not HTML.", isPdf: true };
    if (contentType && !/html|xml/i.test(contentType)) {
      return { ok: false, reason: `Unsupported content-type: ${contentType}` };
    }

    const reader = res.body?.getReader();
    if (!reader) {
      const html = await res.text();
      return { ok: true, html, finalUrl: res.url || url, res };
    }
    const decoder = new TextDecoder("utf-8");
    let bytes = 0;
    let out = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      out += decoder.decode(value, { stream: true });
      if (bytes >= MAX_HTML_BYTES) {
        try { await reader.cancel(); } catch { /* ignore */ }
        break;
      }
    }
    out += decoder.decode();
    return { ok: true, html: out, finalUrl: res.url || url, res };
  } catch (err) {
    return { ok: false, reason: String(err) };
  } finally {
    clearTimeout(timer);
  }
}

async function tryHtmlLink(link: SourceLink): Promise<{ status: FullTextStatus; doc?: ExtractedDocument; reason?: string; finalUrl?: string }> {
  const fetched = await fetchHtml(link.url);
  if (!fetched.ok) {
    // A link filed as HTML that serves a PDF is read as one, here, rather
    // than dropped. This is how every arXiv paper lost its full text: the
    // caller's `arxiv.org/pdf/<id>` has no `.pdf` suffix, was filed as HTML
    // at a rank that beat the builder's own PDF entry for the same URL, and
    // then failed here with "Server returned PDF" — the PDF path never ran
    // and the deep report fell back to the abstract (measured 2026-09-14).
    if (fetched.isPdf) return tryPdfLink(link);
    // A refusal alone does not establish a subscription gate. The final
    // response URL names the host that actually issued it.
    if (typeof fetched.status === "number") {
      const verdict = classifyHardAccessStatus(fetched.finalUrl ?? link.url, fetched.status);
      if (verdict === "paywalled") return { status: "paywalled", reason: paywallReason(fetched.finalUrl ?? link.url), finalUrl: fetched.finalUrl };
      if (verdict === "blocked") return { status: "source_unavailable", reason: blockedReason(fetched.finalUrl ?? link.url), finalUrl: fetched.finalUrl };
    }
    return { status: "source_unavailable", reason: fetched.reason };
  }
  if (/captcha/i.test(fetched.html)) return { status: "source_unavailable", reason: blockedReason(fetched.finalUrl), finalUrl: fetched.finalUrl };
  if (appearsPaywalled(fetched.html)) {
    return {
      status: "paywalled",
      reason: paywallReason(fetched.finalUrl),
      finalUrl: fetched.finalUrl,
    };
  }
  const extractor = chooseHtmlExtractor(fetched.finalUrl);
  const doc = extractor(fetched.html, fetched.finalUrl);
  if (!looksLikeFullText(doc)) {
    return {
      status: "no_full_text",
      reason: "Page reached but did not look like full text.",
    };
  }
  return { status: "ok", doc };
}

async function tryPdfLink(link: SourceLink): Promise<{ status: FullTextStatus; doc?: ExtractedDocument; reason?: string; finalUrl?: string }> {
  const result = await tryExtractPdfText(link.url);
  if (result.ok && result.doc) {
    return { status: "ok", doc: result.doc };
  }
  // Classify the response against the host reached after redirects.
  if (typeof result.status === "number") {
    const verdict = classifyHardAccessStatus(result.finalUrl ?? link.url, result.status);
    if (verdict === "paywalled") return { status: "paywalled", reason: paywallReason(result.finalUrl ?? link.url), finalUrl: result.finalUrl };
    if (verdict === "blocked") return { status: "source_unavailable", reason: blockedReason(result.finalUrl ?? link.url), finalUrl: result.finalUrl };
  }
  // Only explicit purchase/subscription reasons support a paywall verdict.
  const reason = result.reason ?? "PDF unavailable.";
  if (/subscription required|purchase required/i.test(reason)) {
    return { status: "paywalled", reason };
  }
  return { status: "source_unavailable", reason };
}

function paywallReason(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return `${host} requires paid or institutional access — Peer could not read the full paper.`;
  } catch {
    return "The publisher requires paid or institutional access — Peer could not read the full paper.";
  }
}

/**
 * A blocked request is distinct from an established subscription gate.
 */
function blockedReason(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return `${host} blocked this request — Peer could not read the full paper.`;
  } catch {
    return "The source blocked this request — Peer could not read the full paper.";
  }
}

const UPLOAD_EMPTY_REASON = "pdf-empty: PDF text extractor produced no sections.";

/**
 * 1-28: an uploaded PDF is already in Peer's own private storage
 * (`upload-store.ts`), so reading it is a storage read, not a fetch — no
 * `collectSourceLinks` walk, no network attempt, no paywall to hit. Mirrors
 * `tryPdfLink`'s shape/reasoning so `buildResult`'s single `attempts` entry
 * reads the same way a normal PDF attempt would.
 */
async function tryUploadLink(hash16: string): Promise<{ status: FullTextStatus; doc?: ExtractedDocument; reason?: string }> {
  const bytes = await readUploadPdf(hash16).catch((error) => {
    console.warn("[papers/full-text] could not read an uploaded PDF:", error);
    return null;
  });
  if (!bytes) return { status: "no_full_text", reason: "The uploaded PDF is no longer stored." };
  const result = await extractPdfTextFromBytes(bytes);
  if (result.ok && result.doc) {
    // A2-02 (2-05): a reading that succeeded but found no section is the
    // same fact as a scan — nothing to report on. Caught structurally rather
    // than trusting an unconditional "it's ok."
    if (result.doc.sections.length === 0) {
      return { status: "no_full_text", reason: UPLOAD_EMPTY_REASON };
    }
    return { status: "ok", doc: result.doc };
  }
  if (result.reason === "no-text-layer" || result.reason === "no-sections") {
    // Every page was read; there was simply no text to find (most likely a
    // scanned PDF). reading.ts's `pdfHasNoText` looks for this exact
    // `pdf-empty` marker so the reading page can say "this PDF has no
    // readable text" instead of a generic "no full text."
    return { status: "no_full_text", reason: UPLOAD_EMPTY_REASON };
  }
  return { status: "no_full_text", reason: result.reason ?? "PDF text extractor failed on this server." };
}

function uploadLink(hash16: string): SourceLink {
  return { url: `/api/papers/upload/${hash16}/file`, kind: "pdf", label: "upload", rank: 0 };
}

const UPLOAD_UNAVAILABLE: FullTextResult = { status: "source_unavailable", attempts: [], reason: "Private upload unavailable." };

/**
 * P0-05 (§1e.1): an upload's own file, read from its storage. Reached from exactly
 * one place — `uploadFullText`, which `getFullText` calls only once
 * `ownedUpload` has returned this upload's record for the caller. Nothing
 * else in this module reads an upload: `buildPublicResult` has no upload
 * branch at all.
 */
async function readOwnedUpload(hash16: string): Promise<FullTextResult> {
  const link = uploadLink(hash16);
  const outcome = await tryUploadLink(hash16);
  const attempts: FullTextResult["attempts"] = [
    { link, outcome: outcome.status + (outcome.reason ? `: ${outcome.reason}` : "") },
  ];
  if (outcome.status === "ok" && outcome.doc) {
    return { status: "ok", doc: outcome.doc, sourceLink: link, attempts };
  }
  return {
    status: "no_full_text",
    reason: outcome.reason ?? "This PDF has no readable text.",
    attempts,
  };
}

/**
 * A public paper's full text, walked from its legal source links. The
 * shared `cache` below holds only what this returns.
 *
 * P0-05: it used to read an upload too, for any id `bareUploadId` matched —
 * which a case variant reached without the owner check. It has no upload
 * branch now, and refuses an id that claims to be an upload outright, so no
 * spelling of one can make it read a private file or fetch on its behalf.
 */
async function buildPublicResult(input: FullTextInput): Promise<FullTextResult> {
  if (claimsUploadId(input.paperId)) return UPLOAD_UNAVAILABLE;

  const links = await collectSourceLinks({
    url: input.url ?? undefined,
    doi: input.doi ?? undefined,
    arxivId: input.arxivId ?? undefined,
    openAlexId: input.openAlexId ?? undefined,
  });

  const attempts: FullTextResult["attempts"] = [];
  let lastPaywallReason: string | null = null;
  let lastBlockedReason: string | null = null;

  for (const link of links) {
    const outcome =
      link.kind === "html" ? await tryHtmlLink(link) : await tryPdfLink(link);
    attempts.push({
      link,
      outcome: outcome.status + (outcome.reason ? `: ${outcome.reason}` : ""),
      ...(outcome.finalUrl ? { finalUrl: outcome.finalUrl } : {}),
    });
    if (outcome.status === "ok" && outcome.doc) {
      return {
        status: "ok",
        doc: outcome.doc,
        sourceLink: link,
        attempts,
      };
    }
    if (outcome.status === "source_unavailable" && outcome.reason?.includes("blocked this request")) lastBlockedReason = outcome.reason;
    if (outcome.status === "paywalled" && outcome.reason) {
      lastPaywallReason = outcome.reason;
    }
  }

  if (lastPaywallReason) {
    return { status: "paywalled", reason: lastPaywallReason, attempts };
  }
  if (lastBlockedReason) return { status: "source_unavailable", reason: lastBlockedReason, attempts };
  return {
    status: "no_full_text",
    reason: "No legal full-text source returned readable body text.",
    attempts,
  };
}

/** Upload readings in flight, by cache key: the reading request and the
 *  report request for one page open arrive together and share one read — and
 *  so does every later ask while the first is still running (P12-58: the page
 *  asks again until the body is there, and none of those asks starts a second
 *  extraction of a 25 MB PDF). */
const uploadsInFlight = new Map<string, Promise<FullTextResult>>();

/**
 * P12-58: how long a settled reading stays in `uploadsInFlight`, so an ask that arrives just after
 * it settled is given it. The page asks again every 2 to 20 seconds while the reading route's
 * answer is "pending", and each ask waits eight seconds at most: an extraction that ends in the
 * gap between two asks (a scan has nothing to keep, so nothing else would remember it) would
 * otherwise be started again by the next ask, and again, for as long as the page asked. A minute is
 * three times the longest gap. Nothing is kept past it, and a read that threw is not kept at all.
 */
const SETTLED_HOLD_MS = 60_000;

/**
 * The key an upload's extracted document is kept under: owner, hash, revision
 * and the extractor's version (plus the figure revision, inside `uploadDocKey`).
 * One function for the read below and for the upload route's write
 * (`keepUploadDocument`, P12-58), so the document the route keeps is the one
 * the first reading looks for — and for no other owner, revision or extractor.
 */
function uploadDocKeyFor(hash16: string, meta: Pick<UploadMeta, "ownerKey" | "revision">): string {
  return uploadDocKey(meta.ownerKey ?? "", hash16, meta.revision, UPLOAD_CONCEPT_EXTRACTION_VERSION);
}

/**
 * P12-58 (rule 1): keep a document that has already been read out of an
 * upload's PDF, under the key `uploadFullText` reads — so the first reading of
 * a PDF that was just uploaded reads it from here instead of opening the PDF a
 * second time (measured on the owner's papers: 2.3 to 31 CPU seconds, the
 * second of which is what missed the reading route's eight-second wait).
 *
 * Only a document that found text is kept (a scan or a failed read is read
 * again next time, as before), and a failed write is a log line, never an
 * error: the reading stands, only the cache failed. Returns whether the
 * document was kept. Called only by a caller that has already established the
 * owner (the upload route, with the record it has just written; and
 * `uploadFullText` below, after `ownedUpload`).
 */
export async function keepUploadDocument(
  hash16: string,
  meta: Pick<UploadMeta, "ownerKey" | "revision">,
  doc: ExtractedDocument,
): Promise<boolean> {
  if (doc.sections.length === 0) return false;
  try {
    await writeUploadDoc(hash16, uploadDocKeyFor(hash16, meta), doc);
    return true;
  } catch (error) {
    // The reading stands; only the cache failed. No text in the log.
    console.warn("[papers/full-text] could not keep an upload's text:", (error as NodeJS.ErrnoException)?.code ?? "unknown error");
    return false;
  }
}

/**
 * P0-02 (spec D0): an upload's text, read out of the PDF once per owner,
 * revision and extraction version. Called only after `ownedUpload` has
 * passed. The document is kept by `upload-store` (memory for the hour, the
 * sidecar after that) under its own owner-scoped key — never in the shared
 * `cache` below, which any reader of a public paper id is served from. Only
 * a reading that found text is kept: a scan, or a failed read, is read again
 * next time.
 *
 * The extraction version is `UPLOAD_CONCEPT_EXTRACTION_VERSION`, the
 * upload's own record of which extractor read it: bumping it when the
 * extractor changes (P0-03) retires every document read by the old one.
 *
 * P12-58: the upload route keeps the document it extracts at upload time
 * under this same key (`keepUploadDocument`), so for an upload made now the
 * first branch below is the one taken; the extraction below it remains for an
 * upload that predates that, or whose document has expired, and is shared by
 * every request that arrives while it runs (`uploadsInFlight`).
 */
async function uploadFullText(hash16: string, meta: UploadMeta): Promise<FullTextResult> {
  const key = uploadDocKeyFor(hash16, meta);
  const inFlight = uploadsInFlight.get(key);
  if (inFlight) return inFlight;

  const pending = (async (): Promise<FullTextResult> => {
    const kept = await readUploadDoc(hash16, key);
    if (kept) {
      const link = uploadLink(hash16);
      return { status: "ok", doc: kept, sourceLink: link, attempts: [{ link, outcome: "ok" }] };
    }
    const result = await readOwnedUpload(hash16);
    if (result.status === "ok" && result.doc) await keepUploadDocument(hash16, meta, result.doc);
    return result;
  })();
  uploadsInFlight.set(key, pending);
  try {
    const result = await pending;
    const release = setTimeout(() => {
      if (uploadsInFlight.get(key) === pending) uploadsInFlight.delete(key);
    }, SETTLED_HOLD_MS);
    release.unref?.();
    return result;
  } catch (error) {
    if (uploadsInFlight.get(key) === pending) uploadsInFlight.delete(key);
    throw error;
  }
}

/**
 * Cache-aware full-text fetch. Returns the same shape regardless of whether
 * the text came from HTML or PDF.
 */
export async function getFullText(input: FullTextInput): Promise<FullTextResult> {
  // P0-05 (§1e.1): anything that claims to be an upload, in any spelling,
  // takes this branch, and only the canonical id (`bareUploadId`) of an
  // upload the caller owns gets past it. A variant such as `UPLOAD:<hash16>`
  // is refused here, before any lookup — it used to fall through to the
  // shared path below, be read from storage there, and sit in the shared cache.
  if (claimsUploadId(input.paperId)) {
    const hash = bareUploadId(input.paperId);
    const meta = hash ? await ownedUpload(hash) : null;
    if (!hash || !meta) return UPLOAD_UNAVAILABLE;
    // Authenticate before reading — the owner's cache included — and never
    // put private text in the shared cache.
    return uploadFullText(hash, meta);
  }
  const key = input.paperId;
  const cached = cache.get(key);
  if (cached) {
    if (cached instanceof Promise) return cached;
    if (Date.now() - cached.ts <= CACHE_TTL_MS) return cached.result;
    cache.delete(key);
  }

  const pending = buildPublicResult(input);
  cache.set(key, pending);
  try {
    const result = await pending;
    if (readabilityOf(result) === "unknown") cache.delete(key);
    else cache.set(key, { result, ts: Date.now() });
    return result;
  } catch (err) {
    cache.delete(key);
    throw err;
  }
}
