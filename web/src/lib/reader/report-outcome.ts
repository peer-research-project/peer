// What a report means once it has arrived. The wire's `noLlm` flag says "no
// model wrote this"; whether that is an absence or a failure depends on what
// the server said it was doing. At Tier 0 no model was asked, so the empty
// report is the honest nothing and the page shows no model layer. After a
// `tier1` / `tier2` mode event the server had a provider, so an empty report
// back means the model was asked and could not finish — the page owes the
// reader that sentence, not a blank that reads as "nothing to show" — unless
// the request carried nothing the server would ask a model about
// (`modelAsked`, R-BYOK-1 (2)). The JSON fallback carries no mode, so the
// reader's own key stands in for it: with a key configured, the server had a
// provider.

export type ReportOutcome =
  /** A model-written report to render. */
  | "shown"
  /** No model layer: nothing was asked, nothing is missing. */
  | "absent"
  /** The model was asked and could not finish. */
  | "failed";

/**
 * `asked` is whether a model was asked at all: `modelAsked` of what the
 * server said (the stream's mode was not `tier0`, or, on the JSON path, the
 * reader has a provider configured) and of what the request carried.
 */
export function reportOutcome(
  report: { noLlm?: boolean } | null,
  asked: boolean,
): ReportOutcome {
  if (report && !report.noLlm) return "shown";
  return asked ? "failed" : "absent";
}

/**
 * The text an abstract-tier report may be written from: the paper's abstract
 * as the mapper split it, joined as the report route joins it (`fullAbstract`
 * in `app/api/papers/report/route.ts`). Empty when Peer holds no abstract.
 */
export function requestAbstract(paper: { summaryIntro?: string; summaryResultDiscussion?: string }): string {
  return [paper.summaryIntro, paper.summaryResultDiscussion].filter(Boolean).join(" ");
}

/**
 * R-BYOK-1 (2) (D-BYOK-1): whether a model was in fact asked. `providerAsked`
 * — a `tier1` / `tier2` mode, or a key on the JSON path — says the server had
 * a provider; it does not say the provider was called. The route calls a
 * model only about text it holds: the abstract tier only about an abstract
 * (with none, it returns the empty report before any call), and the deep tier
 * about the full text once it has it — which the stream says with its
 * `reading` stage (`fullTextRead`) — falling back to the abstract tier
 * otherwise. With neither, the empty report is "nothing was asked": the page
 * shows the reading's own sentence, never "Your model could not finish".
 */
export function modelAsked(
  providerAsked: boolean,
  request: { abstract: string; fullTextRead: boolean },
): boolean {
  return providerAsked && (request.abstract.trim() !== "" || request.fullTextRead);
}
