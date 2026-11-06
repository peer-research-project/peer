import { describe, expect, it } from "vitest";
import type { Paper } from "@/types";
import type { DigestProvider } from "@/lib/llm/providers/types";
import type { ExtractedDocument } from "./html-text";
import { generateDeepReport } from "./deep-report";

const paper: Paper = {
  id: "openalex:Wtest",
  title: "A test paper with a conclusion",
  authors: ["A. Researcher"],
  relevanceReason: "Matches the declared topic.",
  venue: "Test Venue",
  source: "other",
  summaryIntro: "This paper studies a focused research question.",
  summaryExperimentKeywords: [],
  summaryResultDiscussion: "The experiment supports the stated conclusion.",
  isSaved: false,
};

// Padding to push total body chars past PASS1_TRIGGER_CHARS (10_000), so
// generateDeepReport actually runs pass 1 instead of skipping straight to
// pass 2 with the raw body.
const FILLER = "This sentence exists only to pad the introduction. ".repeat(250);

const CONCLUSION_MARKER =
  "The superconducting dome narrows sharply as the layer ratio L to d approaches 0.9.";

function doc(): ExtractedDocument {
  return {
    sections: [
      { id: "s0", heading: "Introduction", canonical: "introduction", text: FILLER },
      { id: "s1", heading: "Methods", canonical: "methods", text: "We used a standard protocol." },
      { id: "s2", heading: "Results", canonical: "results", text: "The main result was measured." },
      { id: "s3", heading: "Conclusion", canonical: "conclusion", text: CONCLUSION_MARKER },
    ],
    figureCaptions: [],
    source: "pdf",
    pageCount: 12,
  };
}

/** A fake provider that records every `generateJsonText` call in order. */
function fakeProvider(responses: string[]): {
  provider: DigestProvider;
  calls: { systemPrompt: string; userPrompt: string; tier?: string }[];
} {
  const calls: { systemPrompt: string; userPrompt: string; tier?: string }[] = [];
  let i = 0;
  return {
    calls,
    provider: {
      id: "gemini",
      generateDigest: async () => ({ bullets: [] }),
      testConnection: async () => ({ ok: true }),
      generateJsonText: async (args) => {
        calls.push(args);
        const response = responses[Math.min(i, responses.length - 1)];
        i += 1;
        return response;
      },
    },
  };
}

describe("generateDeepReport — pass 1 reads every canonical bucket (1-14)", () => {
  it("feeds the conclusion section to pass 1, not just introduction/methods/results/discussion", async () => {
    const pass1Response = JSON.stringify({
      noveltyClaims: [],
      keyResults: [CONCLUSION_MARKER],
      methodHighlights: [],
      priorWorkComparisons: [],
    });
    const pass2Response = JSON.stringify({
      skim: [],
      whatItProposes: { summary: "", methods: [] },
      resultsAndSignificance: {
        summary: "",
        keyResults: [
          {
            title: "Dome narrowing",
            detail: "The dome narrows near L/d = 0.9.",
            evidence: CONCLUSION_MARKER,
          },
        ],
      },
    });
    const { provider, calls } = fakeProvider([pass1Response, pass2Response]);

    const report = await generateDeepReport({ paper, doc: doc(), provider });

    expect(calls).toHaveLength(2);
    // P2-01 (§1g.1): Pass 1 now reads `[{ id, heading, text }]` in document
    // order instead of `{ canonical: text }` buckets; the 1-14 guarantee is
    // asserted on that shape — every section reaches Pass 1.
    const pass1Prompt = JSON.parse(calls[0].userPrompt) as { sections: Array<{ id: string; heading: string; text: string }> };
    const sent = (heading: string) => pass1Prompt.sections.find((section) => section.heading === heading)?.text;
    // The bug (pre-1-14): buildPass1Prompt only ever read introduction/
    // methods/results/discussion, so a paper's conclusion bucket never
    // reached the model asked to extract signal from it.
    expect(sent("Conclusion")).toContain(CONCLUSION_MARKER);
    expect(sent("Methods")).toContain("standard protocol");
    expect(sent("Results")).toContain("main result");

    // And the claim quoting the conclusion sentence survives the evidence
    // checker — it's genuinely in doc.sections, just previously never shown
    // to the model that writes the claims.
    expect(report?.resultsAndSignificance.keyResults).toHaveLength(1);
    expect(report?.provenance.droppedClaims).toBe(0);
  });
});

// R-BYOK-2 (W25, 2026-11-05) — D-BYOK-2: on the owner's key the deep report on
// two invented fixtures printed "What is new here" lines the text never
// states. Re-run here on invented texts shaped like those fixtures, with a
// stub provider writing the same kind of output; nothing calls a model.
describe("generateDeepReport — novelty lines need a sentence that states them (R-BYOK-2)", () => {
  const noAbstract: Paper = { ...paper, summaryIntro: "", summaryResultDiscussion: "" };
  const section = (id: string, heading: string, canonical: string, text: string) => ({ id, heading, canonical, text });
  const fixture = (sections: ExtractedDocument["sections"]): ExtractedDocument => ({ sections, figureCaptions: [], source: "pdf", pageCount: 1 });

  const CANOPY_METHOD = "Leaf area and canopy water retention duration were measured under controlled identical conditions for every sapling.";
  const CANOPY_RESULT = "Saplings with a larger leaf area kept water on the canopy for longer in every trial we ran.";
  const CANOPY = fixture([
    section("s0", "Fictional canopy study", "introduction", "This fictional canopy study measures leaf area on potted saplings of an invented species."),
    section("s1", "Method", "methods", CANOPY_METHOD),
    section("s2", "Results", "results", `${CANOPY_RESULT} The synthetic test data cover one chamber only.`),
  ]);
  const COURSE_DATA = "This course outline walks through gradient descent on a twenty-point synthetic data set.";
  const COURSE_TREE = "A decision tree is grown to depth three to show its structure.";
  const COURSE = fixture([
    section("s0", "course/machine-learning", "introduction", COURSE_DATA),
    section("s1", "Exercises", "methods", `${COURSE_TREE} Each exercise asks the student to trace one update by hand.`),
  ]);

  const run = async (doc: ExtractedDocument, pass2: unknown) => {
    const { provider, calls } = fakeProvider([JSON.stringify(pass2)]);
    const report = await generateDeepReport({ paper: noAbstract, doc, provider });
    return { report: report!, calls };
  };
  const shownNovelty = (report: { whatItProposes: { newHere?: string[] }; resultsAndSignificance: { keyResults: { novelty?: string }[] } }) =>
    (report.whatItProposes.newHere?.length ?? 0) + report.resultsAndSignificance.keyResults.filter((r) => r.novelty).length;

  it("(a) canopy fixture: an invented novelty — bare or on a method sentence — shows nothing, and is counted", async () => {
    const { report } = await run(CANOPY, {
      skim: [{ text: "Bigger leaves hold water longer.", evidence: CANOPY_RESULT }],
      whatItProposes: {
        summary: "",
        methods: [{ text: "Leaf area and retention under identical conditions.", evidence: CANOPY_METHOD }],
        newHere: [{ text: "It links leaf area measurements directly to extended canopy water retention duration under controlled identical conditions.", evidence: CANOPY_METHOD }],
      },
      resultsAndSignificance: {
        summary: "",
        keyResults: [{ title: "Longer retention", detail: "Bigger leaves held water longer.", evidence: CANOPY_RESULT, novelty: "First direct link between leaf area and retention time." }],
      },
    });
    expect(shownNovelty(report)).toBe(0);
    expect(report.whatItProposes).not.toHaveProperty("newHereClaims");
    // The claims the text does back are untouched.
    expect(report.skim).toHaveLength(1);
    expect(report.whatItProposes.methods).toHaveLength(1);
    expect(report.resultsAndSignificance.keyResults).toHaveLength(1);
    expect(report.resultsAndSignificance.keyResults[0].evidenceWhere).toBe("Results");
    expect(report.provenance.droppedClaims).toBe(2);
  });

  it("(a) course fixture: 'twenty-point synthetic set' and 'depth three' novelty lines show nothing", async () => {
    const { report } = await run(COURSE, {
      skim: [],
      whatItProposes: { summary: "", methods: [{ text: "Depth-three trees.", evidence: COURSE_TREE }], newHere: ["Uses a minimal twenty-point synthetic set specifically designed for basic manual or guided gradient descent tracking."] },
      resultsAndSignificance: {
        summary: "",
        keyResults: [
          { title: "Synthetic set", detail: "Twenty points.", evidence: COURSE_DATA, novelty: "Uses a minimal twenty-point synthetic set specifically designed for basic manual or guided gradient descent tracking.", noveltyEvidence: COURSE_DATA },
          { title: "Shallow trees", detail: "Depth three.", evidence: COURSE_TREE, novelty: "Constrains tree growth strictly to depth three to clearly illustrate structure without overcomplication." },
        ],
      },
    });
    expect(shownNovelty(report)).toBe(0);
    expect(report.resultsAndSignificance.keyResults).toHaveLength(2);
    expect(report.whatItProposes.methods).toHaveLength(1);
    expect(report.provenance.droppedClaims).toBe(3);
  });

  it("(b) a text that says 'Unlike prior work, we ...' with a matching line and its sentence shows exactly that one line", async () => {
    const COMPARISON = "Unlike prior work, we follow the same potted saplings for a whole growing season rather than a single afternoon.";
    const doc = fixture([section("s0", "Introduction", "introduction", `${COMPARISON} We record leaf area every week.`), ...CANOPY.sections.slice(1)]);
    const { report } = await run(doc, {
      skim: [],
      whatItProposes: { summary: "", methods: [], newHere: [{ text: "It follows the same saplings for a whole season, not one afternoon.", evidence: COMPARISON }] },
      resultsAndSignificance: { summary: "", keyResults: [{ title: "Longer retention", detail: "Bigger leaves held water longer.", evidence: CANOPY_RESULT }] },
    });
    expect(shownNovelty(report)).toBe(1);
    expect(report.whatItProposes.newHere).toEqual(["It follows the same saplings for a whole season, not one afternoon."]);
    expect(report.whatItProposes.newHereClaims?.[0]).toMatchObject({ evidence: COMPARISON, evidenceWhere: "Introduction" });
    expect(report.provenance.droppedClaims).toBe(0);
  });

  it("asks for the sentence in the prompt and no longer tells the model novelty carries none", async () => {
    const { calls } = await run(CANOPY, { skim: [], whatItProposes: { summary: "", methods: [] }, resultsAndSignificance: { summary: "", keyResults: [] } });
    const prompt = JSON.parse(calls[0].userPrompt) as { outputSchema: { whatItProposes: { newHere: unknown[] }; resultsAndSignificance: { keyResults: Record<string, string>[] } }; rules: string[] };
    expect(prompt.outputSchema.whatItProposes.newHere[0]).toMatchObject({ evidence: expect.stringContaining("states this novelty or the comparison with prior work") });
    expect(prompt.outputSchema.resultsAndSignificance.keyResults[0].noveltyEvidence).toContain("states this novelty or the comparison with prior work");
    expect(prompt.rules.join(" ")).toContain("Never infer a novelty the paper does not state.");
    expect(calls[0].userPrompt).not.toContain("carry no evidence sentence");
  });
});
