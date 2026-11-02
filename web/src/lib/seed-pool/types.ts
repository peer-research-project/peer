/** Private, independently represented paper in one immutable owner pool. */
export interface SeedPaper {
  id: string;
  uploadId: string;
  canonicalKey: string;
  title: string;
  features: { topic: string[]; object: string[]; method: string[] };
  /** Public identifiers only; never a private PDF or extracted text. */
  publicIds?: { doi?: string; arxivId?: string; openAlexId?: string; semanticScholarId?: string };
}
export interface SeedSnapshot {
  version: string;
  effectiveLocalDate: string;
  seeds: SeedPaper[];
  revocationGeneration: number;
}
/** `unavailable` is a hard failure, never a claim of an empty pool. */
export type SeedPoolResolution = {
  status: "ready" | "none" | "unavailable";
  ownerLocalDate: string | null;
  timezone: string | null;
  snapshot: SeedSnapshot | null;
  revision: number | null;
  /** Monotonic privacy fence, including when no snapshot exists. */
  revocationGeneration: number;
};
export interface ResolveSeedPoolOptions {
  /** Owner-local target date, including a future prepared job's date. */
  targetLocalDate?: string;
  now?: Date;
}
