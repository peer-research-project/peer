import { describe, expect, it } from "vitest";
import { reportForReading } from "./use-model-report";
import { buildReading, describeAvailability } from "@/lib/papers/reading";
import type { Paper } from "@/types";
import type { PaperReport } from "@/lib/papers/report";
const paper = { id: "openalex:W1", title: "Test", authors: [], relevanceReason: "", venue: "", source: "other", summaryIntro: "", summaryResultDiscussion: "", summaryExperimentKeywords: [], isSaved: false } as Paper;
const abstractReport = { depth: "abstract", provenance: { basis: "model-abstract", droppedClaims: 0 }, whatItProposes: { summary: "Invented proposal", methods: [] } } as unknown as PaperReport;
describe("report source compatibility", () => {
  it("withholds abstract report content and its model availability for an empty reading", () => {
    const reading = buildReading(paper, null);
    const shown = reportForReading(abstractReport, reading);
    expect(shown).toBeNull();
    const text = describeAvailability({ reading, report: shown && { basis: shown.provenance.basis, droppedClaims: 0, deepRequested: false }, providerConfigured: true, profileHasProject: false, modelFailed: false, keyNeedsSignIn: false }).join(" ");
    expect(text).not.toContain("Read by your model from the abstract");
    expect(text).not.toContain("Invented proposal");
  });
  it("preserves full text reports without an abstract", () => {
    const deep = { ...abstractReport, depth: "deep", provenance: { basis: "model-fulltext", droppedClaims: 0 } } as PaperReport;
    expect(reportForReading(deep, buildReading(paper, null))).toBe(deep);
  });
  it("retains an abstract report when the reading has the abstract", () => {
    expect(reportForReading(abstractReport, buildReading({ ...paper, summaryIntro: "A sample was green." }, null))).toBe(abstractReport);
  });
});
