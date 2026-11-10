import { describe, expect, it, vi } from "vitest";
import { discoverSeedNeighbors } from "./discovery";
import type { SeedPaper } from "./types";
const seed: SeedPaper = { id: "private-id", uploadId: "private-upload", contentHash: "a".repeat(64), canonicalKey: "doi:1", title: "Private title", features: { topic: ["private phrase"], object: [], method: [] }, publicIds: { openAlexId: "W123", semanticScholarId: "a".repeat(40) } };
describe("public seed discovery", () => {
  it("sends only bounded verified identifiers, not private material", async () => {
    const citations = vi.fn().mockResolvedValue([]); const recommendations = vi.fn().mockResolvedValue([]);
    await discoverSeedNeighbors([seed, { ...seed, id: "duplicate" }], { citations, recommendations });
    expect(citations).toHaveBeenCalledWith(["W123"]);
    expect(recommendations).toHaveBeenCalledWith(["a".repeat(40)]);
    expect(JSON.stringify(citations.mock.calls)).not.toContain("private");
    expect(JSON.stringify(recommendations.mock.calls)).not.toContain("private");
  });
  it("makes no call without public IDs and degrades on provider failure", async () => {
    const citations = vi.fn().mockRejectedValue(new Error("offline")); const recommendations = vi.fn().mockResolvedValue([]);
    expect(await discoverSeedNeighbors([{ ...seed, publicIds: {} }], { citations, recommendations })).toEqual([]);
    expect(citations).not.toHaveBeenCalled(); expect(recommendations).not.toHaveBeenCalled();
    expect(await discoverSeedNeighbors([seed], { citations, recommendations })).toEqual([]);
  });
});


it("resolves a verified DOI with public ID only and checks titles locally", async () => {
  const resolveDoi = vi.fn().mockResolvedValue({ workId: "W789", title: "A Fictional Forest Canopy" });
  const citations = vi.fn().mockResolvedValue([]); const recommendations = vi.fn().mockResolvedValue([]);
  const doiSeed = { ...seed, canonicalKey: "doi:10.1234/example", title: "A Fictional Forest Canopy", publicIds: { doi: "10.1234/example" } };
  await discoverSeedNeighbors([doiSeed], { citations, recommendations, resolveDoi });
  expect(resolveDoi).toHaveBeenCalledWith("10.1234/example");
  expect(citations).toHaveBeenCalledWith(["W789"]);
  expect(JSON.stringify(resolveDoi.mock.calls)).not.toContain("Fictional");
  citations.mockClear(); resolveDoi.mockResolvedValue({ workId: "W789", title: "A Different Public Paper" });
  await discoverSeedNeighbors([doiSeed], { citations, recommendations, resolveDoi });
  expect(citations).not.toHaveBeenCalled();
});

it("falls back without discovery when DOI resolution fails", async () => {
  const resolveDoi = vi.fn().mockRejectedValue(new Error("offline"));
  const citations = vi.fn().mockResolvedValue([]); const recommendations = vi.fn().mockResolvedValue([]);
  const doiSeed = { ...seed, canonicalKey: "doi:10.1234/example", title: "A Fictional Forest Canopy", publicIds: { doi: "10.1234/example" } };
  expect(await discoverSeedNeighbors([doiSeed], { citations, recommendations, resolveDoi })).toEqual([]);
  expect(citations).not.toHaveBeenCalled();
});
