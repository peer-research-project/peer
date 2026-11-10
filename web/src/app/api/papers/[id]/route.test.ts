import { describe, expect, it, vi } from "vitest";
import type { RawItem } from "@/lib/sources/types";
const mocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("@/lib/papers/fetch-by-id", () => ({ fetchPaperById: mocks.lookup }));
import { GET } from "./route";
const item: RawItem = { id: "openalex:W1", source: "openalex", title: "An invented paper", authors: [], url: "https://example.com", publishedAt: "2026-01-01", metadata: {} };
describe("abstract source provenance in the paper route", () => {
  it.each(["blocked", "transient"] as const)("does not publicly cache %s", async (status) => {
    mocks.lookup.mockResolvedValue({ ...item, metadata: { abstractRetrieval: { status, attempts: [] } } });
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: item.id }) });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).abstractRetrieval.status).toBe(status);
  });
});
