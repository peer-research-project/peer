import { afterEach, expect, it, vi } from "vitest";
import { fetchCitationNeighborhood } from "@/lib/affiliation/openalex";
import { fetchSemanticScholarRecommendations } from "@/lib/sources/semantic-scholar-recommendations";
import { __resetSemanticScholarClientForTests } from "@/lib/sources/semantic-scholar-client";
import { discoverSeedNeighbors } from "./discovery";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); __resetSemanticScholarClientForTests(); });
it("keeps private citation requests out of shared fetch cache and provider logs", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const fetcher = vi.fn(async () => new Response("private id echoed", { status: 500 })); vi.stubGlobal("fetch", fetcher);
  await expect(fetchCitationNeighborhood(["W123"], { privateRequest: true })).rejects.toThrow();
  expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  expect(fetcher.mock.calls[0][1]).not.toHaveProperty("next.revalidate");
  expect(error).not.toHaveBeenCalled();
});
it("keeps private recommendation POSTs out of shared cache and provider logs", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const fetcher = vi.fn(async () => new Response("private id echoed", { status: 500 })); vi.stubGlobal("fetch", fetcher);
  await expect(fetchSemanticScholarRecommendations(["a".repeat(40)], { privateRequest: true })).rejects.toThrow();
  expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: "no-store", method: "POST" });
  expect(error).not.toHaveBeenCalled();
});
it("uses no-store for a verified DOI lookup and its citation request", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return calls.length === 1 ? Response.json({ id: "https://openalex.org/W123", title: "A Fictional Forest Canopy" }) : Response.json({ results: [] });
  }));
  await discoverSeedNeighbors([{ id: "p", uploadId: "u", contentHash: "a".repeat(64), canonicalKey: "doi:10.1234/example", title: "A Fictional Forest Canopy", features: { topic: ["forest canopy"], object: [], method: [] }, publicIds: { doi: "10.1234/example" } }]);
  expect(calls).toHaveLength(2);
  expect(calls.every((call) => call.init?.cache === "no-store")).toBe(true);
  expect(calls[0].url).not.toContain("Fictional");
  expect(calls[1].url).not.toContain("forest%20canopy");
});
