import { describe, expect, it } from "vitest";
import { modelAsked, reportOutcome, requestAbstract } from "./report-outcome";

describe("reportOutcome", () => {
  it("shows a model-written report", () => {
    expect(reportOutcome({ noLlm: undefined }, true)).toBe("shown");
    expect(reportOutcome({}, false)).toBe("shown");
  });

  it("is an absence when no model was asked (tier0, or no key on the JSON path)", () => {
    expect(reportOutcome({ noLlm: true }, false)).toBe("absent");
    expect(reportOutcome(null, false)).toBe("absent");
  });

  it("is a failure when the model was asked and sent back the empty report", () => {
    // A tier1 stream whose provider threw, or a paywalled deep read whose
    // shallow retry produced nothing: `emptyReport("fallback")` after a
    // non-tier0 mode. The page must say the model could not finish.
    expect(reportOutcome({ noLlm: true }, true)).toBe("failed");
    expect(reportOutcome(null, true)).toBe("failed");
  });
});

// R-BYOK-1 (2) (D-BYOK-1): a provider on hand is not a model asked. The route's abstract tier
// returns the empty report WITHOUT a call when the request carries no abstract, and its deep tier
// asks only once it holds the full text (the stream's `reading` stage). That empty report is an
// absence, not "Your model could not finish".
describe("modelAsked", () => {
  it("is false when the server had no provider, whatever the request carried", () => {
    expect(modelAsked(false, { abstract: "An invented abstract.", fullTextRead: true })).toBe(false);
    expect(modelAsked(false, { abstract: "", fullTextRead: false })).toBe(false);
  });

  it("is true with a provider and an abstract to ask about (a real failure stays a failure)", () => {
    expect(modelAsked(true, { abstract: "An invented abstract.", fullTextRead: false })).toBe(true);
    expect(reportOutcome({ noLlm: true }, modelAsked(true, { abstract: "An invented abstract.", fullTextRead: false }))).toBe("failed");
  });

  it("is true with a provider once the full text was read, abstract or none", () => {
    expect(modelAsked(true, { abstract: "", fullTextRead: true })).toBe(true);
    expect(reportOutcome({ noLlm: true }, modelAsked(true, { abstract: "", fullTextRead: true }))).toBe("failed");
  });

  it("is false with a provider but no abstract and no full text: the empty report is an absence", () => {
    expect(modelAsked(true, { abstract: "", fullTextRead: false })).toBe(false);
    expect(modelAsked(true, { abstract: "   ", fullTextRead: false })).toBe(false);
    expect(reportOutcome({ noLlm: true }, modelAsked(true, { abstract: "", fullTextRead: false }))).toBe("absent");
  });
});

describe("requestAbstract", () => {
  it("joins the abstract as the report route does, and is empty without one", () => {
    expect(requestAbstract({ summaryIntro: "We test mulch.", summaryResultDiscussion: "Plots kept water." })).toBe("We test mulch. Plots kept water.");
    expect(requestAbstract({ summaryIntro: "We test mulch.", summaryResultDiscussion: "" })).toBe("We test mulch.");
    expect(requestAbstract({ summaryIntro: "", summaryResultDiscussion: "" })).toBe("");
    expect(requestAbstract({})).toBe("");
  });
});
