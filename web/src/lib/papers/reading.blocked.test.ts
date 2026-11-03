import { expect, it } from "vitest";
import { buildReading, describeAvailability } from "./reading";
import type { Paper } from "@/types";
import type { FullTextResult } from "./full-text";
const paper = { id: "x", title: "Test", authors: [], relevanceReason: "", venue: "", source: "other", summaryIntro: "", summaryResultDiscussion: "", summaryExperimentKeywords: [], isSaved: false } as Paper;
const fullText = { status: "source_unavailable", attempts: [{ link: { kind: "html", url: "https://start.test/article" }, outcome: "source_unavailable: end.test blocked this request — Peer could not read the full paper.", finalUrl: "https://end.test/login" }] } as unknown as FullTextResult;
it.each(["", "The invented sample is green."])("names a blocked final host with abstract %s", (summaryIntro) => {
  const reading = buildReading({ ...paper, summaryIntro }, fullText);
  const text = describeAvailability({ reading, report: null, providerConfigured: false, profileHasProject: false, modelFailed: false, keyNeedsSignIn: false }).join(" ");
  expect(text).toContain("end.test blocked this request");
  expect(text).not.toContain("behind access");
});
it("does not label a network failure as blocked", () => {
  const reading = buildReading(paper, { ...fullText, attempts: [{ ...fullText.attempts[0], outcome: "source_unavailable: timeout" }] });
  expect(reading.provenance.fullText).toBe("none");
});
