import { publicFetch } from "@/lib/security/public-fetch";
// Bounded, deterministic abstract retrieval. Third-party text is data, never instructions.
import { cleanDisplayText } from "@/lib/text/clean";
import { fetchSemanticScholar } from "@/lib/sources/semantic-scholar-client";

const BUDGET_MS = 8_000;
const ATTEMPT_MS = 2_500;
const MAX_BODY = 1_000_000;
export type AbstractRetrievalStatus = "found" | "missing" | "blocked" | "transient";
export type AbstractSource = "semantic_scholar" | "crossref" | "publisher_meta" | "publisher_jsonld" | "publisher_section";
export interface AbstractRetrieval {
  status: AbstractRetrievalStatus;
  source?: AbstractSource;
  abstract?: string;
  tldr?: string;
  attempts: Array<{ source: "semantic_scholar" | "crossref" | "publisher"; status: AbstractRetrievalStatus; httpStatus?: number }>;
}
export interface SemanticScholarText { abstract: string | null; tldr: string | null }

async function textWithinLimit(res: Response): Promise<string | null> {
  const length = Number(res.headers.get("content-length"));
  if (length > MAX_BODY) return null;
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BODY) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return new TextDecoder().decode(bytes);
  } catch { return null; } finally { reader.releaseLock(); }
}

function statusOf(res: Response | null): AbstractRetrievalStatus {
  if (!res || res.status === 429 || res.status >= 500) return "transient";
  if ([401, 403, 451].includes(res.status)) return "blocked";
  return res.ok ? "missing" : res.status === 404 ? "missing" : "transient";
}
function cleanAbstract(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = cleanDisplayText(value.replace(/<[^>]*>/g, " ")).replace(/^abstract\s*[:—-]\s*/i, "").trim();
  if (!cleaned || /(?:\.\.\.|…)\s*$|\b(?:read more|view full (?:text|article)|access (?:this|the) article|all rights reserved|subscribe to (?:read|continue)|accept (?:all )?cookies)\b/i.test(cleaned)) return null;
  return cleaned;
}

/** Extract only fields explicitly identified as an abstract. Generic descriptions are not evidence. */
export function publisherAbstract(html: string, identity: { doi?: string; title?: string; url?: string } = {}): { text: string; source: AbstractSource } | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)].map((m) => [m[1].toLowerCase(), m[3]]));
    if ((attrs.name ?? attrs.property ?? "").toLowerCase() !== "citation_abstract") continue;
    const text = cleanAbstract(attrs.content);
    if (text && text.length >= 60) return { text, source: "publisher_meta" };
  }
  const articles: Record<string, unknown>[] = [];
  const collect = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(collect); return; }
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const types = Array.isArray(obj["@type"]) ? obj["@type"] : [obj["@type"]];
    if (types.some((t) => typeof t === "string" && /(?:^|\/)ScholarlyArticle$/i.test(t))) articles.push(obj);
    collect(obj["@graph"]);
  };
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    try { collect(JSON.parse(match[1]) as unknown); } catch { /* malformed metadata */ }
  }
  const normalizeTitle = (value: unknown): string => typeof value === "string" ? cleanDisplayText(value).trim().replace(/\s+/g, " ").toLowerCase() : "";
  const doiOf = (value: unknown): string | undefined => {
    if (Array.isArray(value)) return value.map(doiOf).find(Boolean);
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      return doiOf(obj.value) ?? doiOf(obj["@id"]);
    }
    if (typeof value !== "string") return undefined;
    return value.match(/10\.\d{4,9}\/[\w.()/:;-]+/i)?.[0].toLowerCase();
  };
  const targetDoi = doiOf(identity.doi);
  const targetTitle = normalizeTitle(identity.title);
  const matching = articles.filter((article) => {
    const articleDoi = doiOf(article.identifier) ?? doiOf(article.doi) ?? doiOf(article.url) ?? doiOf(article["@id"]);
    if (targetDoi && articleDoi && targetDoi !== articleDoi) return false;
    const doiMatch = !!targetDoi && articleDoi === targetDoi;
    const titleMatch = !!targetTitle && normalizeTitle(article.headline ?? article.name) === targetTitle;
    const urlMatch = !!identity.url && [article.url, article["@id"]].some((value) => value === identity.url);
    return doiMatch || titleMatch || urlMatch;
  });
  if (matching.length === 1) {
    const text = cleanAbstract(matching[0].abstract);
    if (text && text.length >= 60) return { text, source: "publisher_jsonld" };
  }
  const section = html.match(/<section\b[^>]*(?:id|class)\s*=\s*["'][^"']*\babstract\b[^"']*["'][^>]*>([\s\S]*?)<\/section\s*>/i)?.[1]
    ?? html.match(/<h[1-4]\b[^>]*>\s*abstract\s*<\/h[1-4]\s*>([\s\S]*?)(?=<h[1-4]\b|<\/section\s*>)/i)?.[1];
  const text = section && cleanAbstract(section);
  return text && text.length >= 60 ? { text, source: "publisher_section" } : null;
}

// Only these known public publishers and source APIs may receive requests from
// enrichment. Validate each hop before fetching; a DOI redirect is untrusted.
const TRUSTED_HOSTS = [
  "doi.org", "api.crossref.org", "sciencedirect.com", "elsevier.com",
  "nature.com", "springer.com", "springerlink.com", "wiley.com", "acs.org",
  "tandfonline.com", "oup.com", "academic.oup.com", "cambridge.org",
  "pnas.org", "science.org", "cell.com", "iop.org", "ieee.org",
  "mdpi.com", "frontiersin.org", "plos.org", "biomedcentral.com",
];
const MAX_REDIRECTS = 4;
function trustedUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const authority = raw.match(/^https:\/\/([^/?#]+)/i)?.[1] ?? "";
    if (url.protocol !== "https:" || url.username || url.password || url.port || authority.includes(":")) return false;
    const host = url.hostname.toLowerCase();
    return TRUSTED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch { return false; }
}
async function boundedFetch(url: string, deadline: number): Promise<Response | null> {
  let next = url;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    if (!trustedUrl(next)) return new Response(null, { status: 403 });
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    try {
      const res = await publicFetch(next, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(Math.max(1, Math.min(ATTEMPT_MS, remaining))), headers: { "User-Agent": "PeerBot/0.1", Accept: "text/html,application/json" } });
      if (![301, 302, 303, 307, 308].includes(res.status)) return res;
      const location = res.headers.get("location");
      await res.body?.cancel();
      if (!location || redirects === MAX_REDIRECTS) return null;
      try { next = new URL(location, next).href; } catch { return new Response(null, { status: 403 }); }
      // Reject a user-specified port even if URL normalisation removes :443.
      if (/^(?:https?:)?\/\/[^/?#]*:\d+(?:[/?#]|$)/i.test(location.replace(/\\/g, "/"))) return new Response(null, { status: 403 });
    } catch { return null; }
  }
  return null;
}

async function semanticText(id: string, deadline: number): Promise<{ value: SemanticScholarText | null; status: AbstractRetrievalStatus; httpStatus?: number }> {
  const url = `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(id)}?fields=abstract,tldr`;
  const res = await fetchSemanticScholar(url, { cache: "no-store", redirect: "manual", headers: { Accept: "application/json" } }, ATTEMPT_MS, { deadline, maxRetries: 0 });
  const status = statusOf(res);
  if (!res?.ok) return { value: null, status, httpStatus: res?.status };
  try {
    const raw = await textWithinLimit(res);
    if (raw === null) return { value: null, status: "transient" };
    const data = JSON.parse(raw) as { abstract?: string; tldr?: { text?: string } };
    const value = { abstract: cleanAbstract(data.abstract), tldr: cleanDisplayText(data.tldr?.text) || null };
    return { value, status: value.abstract ? "found" : "missing" };
  } catch { return { value: null, status: "transient" }; }
}
export async function fetchSemanticScholarText(externalId: string): Promise<SemanticScholarText | null> {
  return (await semanticText(externalId, Date.now() + BUDGET_MS)).value;
}
export async function retrieveAbstract(opts: { openalexId?: string; arxivId?: string; doi?: string; title?: string }): Promise<AbstractRetrieval> {
  const deadline = Date.now() + BUDGET_MS;
  const attempts: AbstractRetrieval["attempts"] = [];
  const doi = opts.doi?.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").trim();
  const validDoi = doi && /^10\.\d{4,9}\/[\w.()/:;-]+$/i.test(doi) ? doi : undefined;
  const id = opts.arxivId ? `arXiv:${opts.arxivId}` : opts.openalexId ? `OpenAlex:${opts.openalexId}` : validDoi ? `DOI:${validDoi}` : undefined;
  let tldr: string | undefined;
  const ids = id ? [id] : [];
  if (validDoi && id && !id.startsWith("DOI:")) ids.push(`DOI:${validDoi}`);
  for (const candidate of ids) {
    if (Date.now() >= deadline) { attempts.push({ source: "semantic_scholar", status: "transient" }); break; }
    const result = await semanticText(candidate, deadline);
    attempts.push({ source: "semantic_scholar", status: result.status, ...(result.httpStatus ? { httpStatus: result.httpStatus } : {}) });
    tldr ??= result.value?.tldr ?? undefined;
    if (result.value?.abstract) return { status: "found", source: "semantic_scholar", abstract: result.value.abstract, tldr, attempts };
    if (result.status === "transient" || result.status === "blocked") break;
  }
  if (validDoi) {
    for (const source of ["crossref", "publisher"] as const) {
      const url = source === "crossref" ? `https://api.crossref.org/works/${encodeURIComponent(validDoi)}` : `https://doi.org/${validDoi}`;
      const res = await boundedFetch(url, deadline);
      let status = statusOf(res);
      if (res?.ok) {
        const raw = await textWithinLimit(res);
        if (raw === null) status = "transient";
        else if (source === "crossref") {
          try {
            const text = cleanAbstract((JSON.parse(raw) as { message?: { abstract?: string } }).message?.abstract);
            if (text) { attempts.push({ source, status: "found" }); return { status: "found", source: "crossref", abstract: text, tldr, attempts }; }
          } catch { status = "transient"; }
        } else {
          if (/captcha|cf-chl-|challenge-platform|checking your browser|verify (?:you are|that you are) human/i.test(raw)) {
            attempts.push({ source, status: "blocked", httpStatus: res.status });
            continue;
          }
          const found = publisherAbstract(raw, { doi: validDoi, title: opts.title, url: res.url || undefined });
          if (found && found.text.toLowerCase() !== opts.title?.trim().toLowerCase()) { attempts.push({ source, status: "found" }); return { status: "found", source: found.source, abstract: found.text, tldr, attempts }; }
        }
      }
      attempts.push({ source, status, ...(res?.status ? { httpStatus: res.status } : {}) });
    }
  }
  const status = attempts.some((a) => a.status === "transient") ? "transient" : attempts.some((a) => a.status === "blocked") ? "blocked" : "missing";
  return { status, tldr, attempts };
}
export async function fetchAbstract(opts: { openalexId?: string; arxivId?: string; doi?: string }): Promise<string | null> {
  return (await retrieveAbstract(opts)).abstract ?? null;
}
