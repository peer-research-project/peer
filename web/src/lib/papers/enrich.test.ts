import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawItem } from "@/lib/sources/types";

const mocks = vi.hoisted(() => ({
  openAlexWorkToRawItem: vi.fn(),
}));

vi.mock("@/lib/utils/openalex", () => ({
  openAlexWorkToRawItem: mocks.openAlexWorkToRawItem,
}));

import { fetchAbstract, fetchSemanticScholarText, publisherAbstract, retrieveAbstract } from "./enrich";
import { fetchPaperById } from "./fetch-by-id";

/** A fetch that answers Semantic Scholar with one fixed record and everything else with 404. */
function stubFetch(s2: Record<string, unknown>, openAlexWork: unknown = { id: "W1" }) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith("https://api.semanticscholar.org/")) {
      return new Response(JSON.stringify(s2), { status: 200 });
    }
    if (url.startsWith("https://api.openalex.org/works/")) {
      return new Response(JSON.stringify(openAlexWork), { status: 200 });
    }
    return new Response("", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const bareItem = (): RawItem => ({
  id: "openalex:W1",
  source: "openalex",
  title: "A paper with no licensed abstract",
  authors: ["A. Author"],
  url: "https://doi.org/10.1000/x",
  publishedAt: "2026-09-01",
  metadata: { doi: "https://doi.org/10.1000/x" },
});

describe("Semantic Scholar abstract and TLDR", () => {
  beforeEach(() => {
    mocks.openAlexWorkToRawItem.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the TLDR apart from the abstract", async () => {
    stubFetch({ abstract: null, tldr: { text: "A machine-written line." } });

    expect(await fetchSemanticScholarText("DOI:10.1000/x")).toEqual({
      abstract: null,
      tldr: "A machine-written line.",
    });
  });

  it("fetchAbstract never returns a TLDR as the abstract", async () => {
    stubFetch({ abstract: null, tldr: { text: "A machine-written line." } });

    expect(await fetchAbstract({ doi: "10.1000/x" })).toBeNull();
  });

  it("fetchPaperById sets item.tldr from the TLDR and leaves item.abstract empty", async () => {
    stubFetch({ abstract: null, tldr: { text: "A machine-written line." } });
    mocks.openAlexWorkToRawItem.mockReturnValue(bareItem());

    const item = await fetchPaperById("openalex:W1");

    expect(item?.abstract).toBeUndefined();
    expect(item?.tldr).toBe("A machine-written line.");
  });

  it("fetchPaperById sets item.abstract from a real abstract and stops at the first hit", async () => {
    const fetchMock = stubFetch({
      abstract: "The authors' own abstract, as published.",
      tldr: { text: "A machine-written line." },
    });
    mocks.openAlexWorkToRawItem.mockReturnValue(bareItem());

    const item = await fetchPaperById("openalex:W1");

    expect(item?.abstract).toBe("The authors' own abstract, as published.");
    expect(item?.tldr).toBe("A machine-written line.");
    const s2Calls = fetchMock.mock.calls.filter(([url]) =>
      String(url).startsWith("https://api.semanticscholar.org/"),
    );
    expect(s2Calls).toHaveLength(1);
  });
});


describe("bounded abstract enrichment", () => {
  afterEach(() => vi.unstubAllGlobals());
  const abstract = "This invented study compares two methods and reports a measured improvement across a controlled set of experiments.";
  it("accepts citation metadata, ScholarlyArticle JSON-LD and an explicit section", () => {
    expect(publisherAbstract(`<meta content="${abstract}" name="citation_abstract">`)).toEqual({ text: abstract, source: "publisher_meta" });
    expect(publisherAbstract(`<script type="application/ld+json">${JSON.stringify({ "@type": "ScholarlyArticle", abstract })}</script>`)).toEqual({ text: abstract, source: "publisher_jsonld" });
    expect(publisherAbstract(`<section id="abstract"><p>${abstract}</p></section>`)).toEqual({ text: abstract, source: "publisher_section" });
  });
  it("rejects generic descriptions, TLDR, unrelated JSON-LD and truncated text", () => {
    expect(publisherAbstract(`<meta property="og:description" content="${abstract}">`)).toBeNull();
    expect(publisherAbstract(`<script type="application/ld+json">${JSON.stringify({ "@type": "WebSite", abstract })}</script>`)).toBeNull();
    expect(publisherAbstract(`<meta name="citation_abstract" content="${abstract.slice(0, 80)}...">`)).toBeNull();
  });
  it("connects lookup to a publisher abstract while retaining TLDR separately", async () => {
    mocks.openAlexWorkToRawItem.mockReturnValue(bareItem());
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input); calls.push(url);
      if (url.includes("api.openalex.org")) return Response.json({ id: "W1" });
      if (url.includes("semanticscholar.org")) return Response.json({ abstract: null, tldr: { text: "Machine summary." } });
      if (url.includes("api.crossref.org")) return Response.json({ message: {} });
      return new Response(`<meta name="citation_abstract" content="${abstract}">`);
    }));
    const item = await fetchPaperById("openalex:W1");
    expect(item?.abstract).toBe(abstract);
    expect(item?.tldr).toBe("Machine summary.");
    expect(item?.metadata.abstractRetrieval).toMatchObject({ status: "found", source: "publisher_meta" });
    expect(calls).toHaveLength(5);
  });
  it("distinguishes blocked and temporary failures from confirmed missing metadata", async () => {
    for (const [code, status] of [[401, "blocked"], [403, "blocked"], [451, "blocked"], [429, "transient"], [500, "transient"], [404, "missing"]] as const) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: code })));
      const result = await retrieveAbstract({ doi: "10.1234/example" });
      expect(result.status).toBe(status);
      expect(result.attempts.every((attempt) => attempt.status === status && attempt.httpStatus === code)).toBe(true);
      expect(result.abstract).toBeUndefined();
      expect(result.attempts).toHaveLength(3);
    }
  });
  it("enforces the response-size limit without treating truncation as absence", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ abstract: "A".repeat(1_000_001) })));
    const result = await retrieveAbstract({ doi: "10.1234/large" });
    expect(result.status).toBe("transient");
    expect(result.abstract).toBeUndefined();
  });
  it("does not admit a citation field that only repeats the title", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("semanticscholar.org")) return Response.json({ abstract: null });
      if (url.includes("crossref.org")) return Response.json({ message: {} });
      return new Response(`<meta name="citation_abstract" content="${abstract}">`);
    }));
    const result = await retrieveAbstract({ doi: "10.1234/title", title: abstract });
    expect(result.status).toBe("missing");
    expect(result.abstract).toBeUndefined();
  });

});
