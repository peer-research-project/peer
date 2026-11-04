import type { PreferenceConcept } from "@/types";
import type { ExtractedDocument } from "@/lib/papers/html-text";
import { normalizePreferenceLabel, preferenceKey } from "./ledger";
import { ABBREVIATION_GROUPS, canonicalize, isGenericTerm } from "@/lib/scoring/term-expand";

// 9-21 (A9-04/A9-11): the local extraction algorithm's own version. Bumped
// whenever the candidate-filtering or facet rules change meaningfully, so a
// concept already stored in a user's ledger/meta can be told apart from one
// a future rewrite of this module would produce.
//
// 2 (P0-03): uploads are read by pdf.js, not the Python helper, so the text
// these concepts come from changed. The same number keys the server's cache
// of an upload's extracted text (`full-text.ts`, P0-02), so the bump also
// retires every document the Python helper read.
// 3 (P7-10): two-column papers are read column by column; text cached under 2 is scrambled and is re-read.
// 4 (P7-11): the hygiene rules after the columns (no hyphen-ended or decimal-led "headings", no notation
// lifted out of a sentence as an equation, the paragraph indent read against the usual left edge, the
// received/accepted date box dropped, captions to 2,000 characters, citation superscripts dropped);
// text cached under 3 still carries them and is re-read.
// 5 (P7-18): the end matter after the argument (associated content, author information, data availability ...)
// is out of the sections, and a numbered subsection takes its parent's bucket even when the parent holds no
// text of its own; text cached under 4 still carries the affiliation fragments and `body` for 2.x and 4.x.
// 6 (P8-03): only a numbered line is a display equation in a PDF (an unnumbered symbol line stays in its
// paragraph), and a glyph before an end-matter heading ("■ ACKNOWLEDGMENTS", "*sı Supporting Information")
// no longer hides it; text cached under 5 still carries the fragments lifted out as "equations" and the
// apparatus after a glyph-led heading.
// 10 (P10-04): a numbered heading with no text of its own that numbers the heading after it ("2. RESULTS AND
// DISCUSSION") is kept as a section with empty text, HTML and PDF alike; text cached under 9 has no such
// section, so the map has no group row for it and the body no group heading.
// 11 (P10-33, P10-34): a running head is a band line on three pages, so a paragraph whose words repeat is kept;
// two blocks join across a page break only when the first has not ended its sentence; and each figure carries its
// picture's width and height. Text cached under 10 lacks the kept paragraphs and the sizes. A saved note keeps its
// passage through the new split by its quote (P10-35).
// 12 (P10-40): a PMC section's nested subsections are sections of their own (`extractPmc` walks `<section>` by depth),
// and an abstract sentence holds no line break; text cached under 11 folds the first subsection into its parent.
// 13 (P10-42): a block with no sentence end joins the next across a page break or a floating figure whatever the
// next word (unless it opens a heading or a list); text cached under 12 cuts such a sentence at a capital.
// 14: reread PDFs with narrow gutters and repeated four-line footers.
// 15 (R-C3b, W20): no concept label holds a verb (`holdsVerb`). The PDF reading itself is unchanged, so the
// bump only makes the server read each upload's text once more (a cache miss on the 14 key, then the stored
// PDF is read and the sidecar is rewritten under 15); nothing is deleted. Concepts already stored on an upload
// or a seed are not recomputed by it.
export const UPLOAD_CONCEPT_EXTRACTION_VERSION = 15;

// A conservative, local phrase extractor. No document text is sent to a model
// for preference learning. References, author blocks and boilerplate are out.
const STOP = new Set(("a an the and or of for to in on at by from with without into as is are was were be been being " +
  "this that these those it its their our we they you can may could should will would not no than then " +
  "using used use based via between during through over under more most also such which where when how " +
  "study studies paper article work research results result show shows shown found demonstrate demonstrated " +
  "measure measures measured improve improves improved support supports supported enable enables achieve achieves " +
  "propose proposed present presents presented new novel high low large small significant significantly " +
  "however therefore respectively compared comparison introduction abstract conclusion conclusions " +
  "figure figures table supplementary copyright reserved rights publisher doi http https www et al").split(/\s+/));

// 9-21 (A9-04): single-word candidates this module will keep. Long forms in
// `ABBREVIATION_GROUPS` are all multi-word once canonicalized (hyphens become
// spaces — "li-ion" -> "li ion"), so this only ever picks up the short forms
// ("lco", "nmc", "xrd", "dft", "operando", …) — real domain vocabulary this
// codebase already recognizes, never an ordinary prose noun like "nodes".
const KNOWN_SINGLE_TOKEN_TERMS = new Set(
  ABBREVIATION_GROUPS.flatMap((group) => group.map((form) => canonicalize(form)))
    .filter((form) => form && !form.includes(" ")),
);

const NUMBER_WORDS = new Set([
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
]);

// Unit abbreviations that only ever show up glued to a number in scientific
// prose ("500 nm", "20 wt%") — never a research concept on their own. Most
// two-letter forms are already excluded by the token-length-3 floor below;
// listed anyway for the 3+ letter ones and for defensiveness.
const UNIT_WORDS = new Set([
  "nm", "mm", "cm", "km", "mg", "kg", "ml", "hz", "khz", "mhz", "ghz",
  "wh", "kwh", "mah", "ah", "ppm", "psi", "pa", "kpa", "mpa", "gpa",
  "mv", "kv", "ma", "min", "hr", "wt",
]);

function isDigitOrUnitToken(token: string): boolean {
  if (/^\d+$/.test(token)) return true;
  if (UNIT_WORDS.has(token)) return true;
  // A number immediately followed by a short unit suffix, glued into one
  // token by the tokenizer ("500nm", "20wt").
  return /^\d+[a-z]{1,4}$/.test(token);
}

function isAcceptableSingleToken(token: string): boolean {
  if (isGenericTerm(token)) return false;
  if (NUMBER_WORDS.has(token)) return false;
  if (isDigitOrUnitToken(token)) return false;
  return KNOWN_SINGLE_TOKEN_TERMS.has(token);
}

/** 9-21: candidate-level gate, applied after the n-gram builder's own
 * per-token stop/length filter (which already keeps a STOP word out of any
 * candidate). Rejects a bare number word or digit/unit token anywhere in the
 * phrase, a single token that isn't a known domain term, and a multi-token
 * phrase made entirely of generic words ("materials data"). */
function isAcceptableCandidate(label: string): boolean {
  const tokens = label.split(" ");
  if (tokens.some((token) => NUMBER_WORDS.has(token) || isDigitOrUnitToken(token))) return false;
  if (tokens.length === 1) return isAcceptableSingleToken(tokens[0]);
  return !tokens.every((token) => STOP.has(token) || isGenericTerm(token));
}

// R-P1 (W9, 2026-11-04): a phrase may not start or end on a verb-like or
// function word ("electrolyte concentration affects", "retention after rain").
// The n-gram builder already breaks on every STOP word and on tokens shorter
// than three letters, so of this list only affects/affect/affected/after can
// reach a candidate today; the rest are listed so the rule reads as ruled.
// Trimming is a filter: the trimmed phrase ("electrolyte concentration") is
// always a candidate of its own, from the same occurrences, with at least the
// same count and title flag, so dropping the untrimmed form is "trim, then
// dedupe" without counting any occurrence twice. The trimmed phrase still
// faces every other gate (a single word must be a known domain term), and no
// score or weight changes. A verb inside a phrase ("density affects water")
// is R-C3b's rule, below.
// Exported for R-C18 (W11): a seed reason never quotes a phrase holding one of these words anywhere.
// R-C3b (W20) added the finite verbs on the last two lines: verb-only forms common in abstract prose,
// never a noun spelling ("reaches", "remains", "yields", "leads", "drives", "controls" stay out).
export const PHRASE_BOUNDARY_WORDS: ReadonlySet<string> = new Set(("affects affect affected using used shows show is are was were " +
  "of for with and the a an to in on after under than how " +
  "reduces reduce enhances enhance determines determine promotes promote inhibits inhibit suppresses suppress " +
  "regulates regulate mediates mediate governs govern retains retain maintains maintain contains contain " +
  "depends depend differs differ occurs occur exceeds exceed outperforms outperform explains explain reveals reveal " +
  "indicates indicate suggests suggest provides provide requires require").split(" "));
const BOUNDARY_WORDS = PHRASE_BOUNDARY_WORDS;

function endsOnFunctionWord(label: string): boolean {
  const tokens = label.split(" ");
  return BOUNDARY_WORDS.has(tokens[0]) || BOUNDARY_WORDS.has(tokens[tokens.length - 1]);
}

// R-C3b (W20, 2026-11-04): no facet label holds a verb. R-P1 trims the edges;
// this drops a phrase with a verb anywhere in it: a word from the list above
// ("density affects water", "retention after rain"), or a past participle
// ("-ed") after the first word, where it reads as the verb of the words
// before it ("denser foliage retained", "concentration maintained capacity").
// As with R-P1 this is a filter, never an edit: every shorter n-gram of the
// same occurrences ("denser foliage", "electrolyte concentration") is already
// a candidate with at least the same count, so dropping the verb-holding form
// splits it at the verb without inventing a word, and the pieces still face
// every other gate. A first-word participle is an adjective ("doped cathode",
// "supervised learning") and stays; so does a hyphenated compound
// ("nitrogen-doped"), which is one token. "-ing" is not judged by its shape:
// after a noun it is almost always a known term ("machine learning", "remote
// sensing", "electrochemical cycling"), so only a listed "-ing" verb counts.
// A known term whose later word only looks like a participle is kept by the
// explicit list below (its adjacent word pairs are exempt), with a test.
export const KNOWN_PARTICIPLE_TERMS: readonly string[] = [
  "machine learning", "deep learning", "remote sensing", "boundary layer",
  "surface enhanced raman", "plasma enhanced", "laser induced", "light induced", "drug induced", "stress induced",
  "time resolved", "angle resolved", "self assembled", "self supervised", "semi supervised", "weakly supervised",
  "fully connected", "computer aided", "physics informed", "fiber reinforced", "highly ordered",
  "nitrogen doped", "fluorine doped", "boron doped", "carbon coated", "glucose stimulated",
];
const KNOWN_TERM_PAIRS = new Set(KNOWN_PARTICIPLE_TERMS.flatMap((term) => {
  const words = term.split(" ");
  return words.slice(1).map((word, i) => `${words[i]} ${word}`);
}));
// Words ending in "-ed" that are not participles.
const NOT_PARTICIPLE = new Set(["infrared", "hundred", "kindred", "sacred", "naked", "wicked", "rugged", "jagged", "ragged", "crooked", "beloved", "embed"]);

function isParticipleShaped(token: string): boolean {
  return token.length >= 5 && token.endsWith("ed") && !token.endsWith("eed") && !token.includes("-") && !NOT_PARTICIPLE.has(token);
}

/** R-C3b: true when a phrase holds a verb anywhere (see above). */
export function holdsVerb(label: string): boolean {
  const tokens = label.split(" ");
  return tokens.some((token, i) => BOUNDARY_WORDS.has(token)
    || (i > 0 && isParticipleShaped(token) && !KNOWN_TERM_PAIRS.has(`${tokens[i - 1]} ${token}`)));
}

// 9-21: rule-based facet classification (handoff §4.1's method/material/topic
// split) — a short, closed cue list, never a model call or taxonomy lookup.
const METHOD_CUES = new Set([
  "spectroscopy", "diffraction", "microscopy", "simulation", "deposition",
  "synthesis", "model", "algorithm", "benchmark", "dataset", "chromatography",
  "voltammetry", "calorimetry", "titration", "regression", "embedding",
  "embeddings", "network", "imaging", "transform",
  // R-C3 (W11, 2026-11-04): a small, explicit set of domain-general
  // measurement and survey methods (field, social, transport, ecology), so
  // method recognition is not materials-science-only. Still a closed list.
  "photogrammetry", "sensor", "sensors", "survey", "surveys", "interview",
  "interviews", "tracing", "profiler", "profilers", "microsimulation",
  "detector", "detectors", "logger", "loggers", "measurement", "measurements",
]);
const MATERIAL_CUES = new Set([
  "alloy", "oxide", "perovskite", "electrolyte", "composite", "polymer",
  "ceramic", "catalyst", "cathode", "anode", "nanoparticle", "nanoparticles",
  // R-C3 (W11): a few domain-general studied substances outside materials science.
  "sediment", "sediments", "soil", "soils", "groundwater", "biomass", "tissue",
]);
// "-ide"/"-ate"/"-ite" suffix cue, guarded by a length floor so short,
// unrelated words ("site", "quite") don't false-positive into "material".
const MATERIAL_SUFFIX_RE = /(?:ide|ate|ite)$/;
const MIN_SUFFIX_CUE_LENGTH = 6;
// A chemical-formula-shaped token ("nmc811", "lifepo4") — letters then a
// digit, glued into one word by the tokenizer.
const CHEMICAL_FORMULA_RE = /^[a-z]{1,4}\d[a-z\d]*$/;

function classifyFacet(label: string): NonNullable<PreferenceConcept["facet"]> {
  const tokens = label.split(" ");
  if (tokens.some((token) => METHOD_CUES.has(token))) return "method";
  if (tokens.some((token) =>
    MATERIAL_CUES.has(token) ||
    CHEMICAL_FORMULA_RE.test(token) ||
    (token.length >= MIN_SUFFIX_CUE_LENGTH && MATERIAL_SUFFIX_RE.test(token)),
  )) return "material";
  return "topic";
}

export function extractUploadConcepts(doc: ExtractedDocument): PreferenceConcept[] {
  const sections = [
    { canonical: "title", text: doc.title ?? "", weight: 4 },
    ...doc.sections.filter((s) => !/reference|bibliograph|acknowledg|funding|author/i.test(s.canonical + " " + s.heading))
      .map((s) => ({ ...s, weight: s.canonical === "abstract" ? 3 : /method|result|conclusion/.test(s.canonical) ? 2 : 1 })),
  ];
  const candidates = new Map<string, { count: number; score: number; section: string; title: boolean }>();
  for (const section of sections) {
    const tokens = section.text.slice(0, 14000).toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]*|[.,;:!?\n]/gu) ?? [];
    for (let start = 0; start < tokens.length; start++) {
      for (let length = 1; length <= 3 && start + length <= tokens.length; length++) {
        const parts = tokens.slice(start, start + length);
        if (parts.some((t) => STOP.has(t) || !/\p{L}/u.test(t) || t.length < 3)) break;
        const label = normalizePreferenceLabel(parts.join(" "));
        const old = candidates.get(label);
        candidates.set(label, { count: (old?.count ?? 0) + 1,
          score: (old?.score ?? 0) + section.weight * (length === 1 ? 0.45 : length),
          section: old?.section ?? section.canonical, title: !!old?.title || section.canonical === "title" });
      }
    }
  }
  const ranked = [...candidates].filter(([label, c]) => label.length <= 70 && (c.title || c.count >= 2))
    .filter(([label]) => isAcceptableCandidate(label) && !endsOnFunctionWord(label) && !holdsVerb(label))
    .sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0]));
  const out: PreferenceConcept[] = [];
  for (const [label, c] of ranked) {
    if (out.some((p) => p.label.includes(label) || label.includes(p.label))) continue;
    out.push({ key: preferenceKey(label), label, source: "uploaded_article", section: c.section,
      facet: classifyFacet(label), extractionVersion: UPLOAD_CONCEPT_EXTRACTION_VERSION,
      confidence: Math.min(0.95, (c.title ? 0.65 : 0.45) + Math.min(c.count, 5) * 0.06) });
    if (out.length === 12) break;
  }
  return out;
}

// 9-31 (A9-09, Ruling 8 made concrete): three-band paper-attachment
// matching, replacing the old binary `matchesUploadedPaper`. A verified DOI
// (present and equal on both sides) always wins, positive or negative — a
// mismatched DOI is an explicit, stronger signal than any amount of title
// overlap and must never be second-guessed by a coincidentally similar
// title. Absent a DOI on either side, normalized-title token overlap alone
// decides which of the other three bands applies.
export type PaperMatchBand = "doi" | "strong" | "confirm" | "reject";
export interface PaperMatchResult {
  band: PaperMatchBand;
  /** Jaccard-shaped overlap fraction of normalized title tokens — always
   * computed, even on a "doi" band, so a caller can log/display it. */
  overlap: number;
}

/** ≥ this fraction (and ≥ 2 overlapping words — the old function's own
 * floor, preserved) auto-binds with a one-line confirmation. */
export const MATCH_STRONG_THRESHOLD = 0.6;
/** ≥ this fraction (below `MATCH_STRONG_THRESHOLD`) asks the user to
 * explicitly confirm before binding; below it, the attach is refused. */
export const MATCH_CONFIRM_THRESHOLD = 0.35;

export function matchUploadedPaper(target: { title: string; doi?: string }, title: string, doi?: string): PaperMatchResult {
  const normalizeDoi = (value: string) => value.toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi.org\//, "").trim();
  const tokens = (value: string) => new Set(normalizePreferenceLabel(value).split(" ").filter((t) => t.length > 2 && !STOP.has(t)));
  const expected = tokens(target.title);
  const actual = tokens(title);
  const overlapCount = [...expected].filter((word) => actual.has(word)).length;
  const overlap = overlapCount / Math.max(1, Math.min(expected.size, actual.size));

  if (target.doi && doi) {
    return { band: normalizeDoi(target.doi) === normalizeDoi(doi) ? "doi" : "reject", overlap };
  }
  if (overlapCount >= 2 && overlap >= MATCH_STRONG_THRESHOLD) return { band: "strong", overlap };
  if (overlap >= MATCH_CONFIRM_THRESHOLD) return { band: "confirm", overlap };
  return { band: "reject", overlap };
}
