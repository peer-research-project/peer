import type { SeedPaper, SeedSnapshot } from "./types";

export interface SeedPoolState {
  revision: number;
  revocationGeneration: number;
  /** Already activated snapshots, sorted/selected by their effective date. */
  history: SeedSnapshot[];
  /** Only the latest staged change. It is effective for future target dates. */
  pending: SeedSnapshot | null;
}
export const EMPTY_SEED_POOL: SeedPoolState = { revision: 0, revocationGeneration: 0, history: [], pending: null };
export type SeedStateError = "stale_revision" | "invalid_date" | "invalid_seed" | "too_many" | "duplicate" | "no_pending";
export type SeedStateResult = { ok: true; state: SeedPoolState } | { ok: false; error: SeedStateError };

export function validLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function nextLocalDate(value: string): string | null {
  if (!validLocalDate(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function validPaper(paper: SeedPaper): boolean {
  return Boolean(paper && typeof paper.id === "string" && paper.id && typeof paper.uploadId === "string" && paper.uploadId &&
    typeof paper.canonicalKey === "string" && paper.canonicalKey && typeof paper.title === "string" && paper.title.trim() &&
    paper.features && (["topic", "object", "method"] as const).every((key) => Array.isArray(paper.features[key]) && paper.features[key].every((v) => typeof v === "string" && v.trim())) &&
    (["topic", "object", "method"] as const).some((key) => paper.features[key].length > 0));
}
/** Select without mutating: tomorrow's precomputation must not promote today. */
export function snapshotForDate(state: SeedPoolState, targetLocalDate: string): SeedSnapshot | null {
  if (!validLocalDate(targetLocalDate)) return null;
  const candidates = [...state.history, ...(state.pending ? [state.pending] : [])]
    .filter((s) => s.effectiveLocalDate <= targetLocalDate)
    .sort((a, b) => b.effectiveLocalDate.localeCompare(a.effectiveLocalDate));
  return candidates[0] ?? null;
}
function promoteDue(state: SeedPoolState, today: string): SeedPoolState {
  if (!state.pending || state.pending.effectiveLocalDate > today) return state;
  return { ...state, history: [...state.history, state.pending], pending: null };
}
/** Pure state transition; the repository serializes it with a DB owner lock. */
export function setSeedPool(state: SeedPoolState, input: { expectedRevision: number; today: string; servedToday: boolean; version: string; seeds: SeedPaper[] }): SeedStateResult {
  if (input.expectedRevision !== state.revision) return { ok: false, error: "stale_revision" };
  const tomorrow = nextLocalDate(input.today);
  if (!tomorrow) return { ok: false, error: "invalid_date" };
  if (input.seeds.length > 5) return { ok: false, error: "too_many" };
  if (!input.version || input.seeds.some((seed) => !validPaper(seed))) return { ok: false, error: "invalid_seed" };
  if (new Set(input.seeds.map((seed) => seed.canonicalKey)).size !== input.seeds.length || new Set(input.seeds.map((seed) => seed.id)).size !== input.seeds.length) return { ok: false, error: "duplicate" };
  const current = promoteDue(state, input.today);
  const immediate = current.history.length === 0 && !input.servedToday && input.seeds.length > 0;
  const snapshot: SeedSnapshot = { version: input.version, effectiveLocalDate: immediate ? input.today : tomorrow, seeds: structuredClone(input.seeds), revocationGeneration: current.revocationGeneration };
  return { ok: true, state: { ...current, revision: current.revision + 1, history: immediate ? [...current.history, snapshot] : current.history, pending: immediate ? null : snapshot } };
}
export function undoPending(state: SeedPoolState, expectedRevision: number, today: string): SeedStateResult {
  if (expectedRevision !== state.revision) return { ok: false, error: "stale_revision" };
  if (!validLocalDate(today)) return { ok: false, error: "invalid_date" };
  const current = promoteDue(state, today);
  if (!current.pending) return { ok: false, error: "no_pending" };
  return { ok: true, state: { ...current, revision: current.revision + 1, pending: null } };
}
/** Forget is a privacy exception to frozen dates: scrub every historical and future snapshot. */
export function forgetSeed(state: SeedPoolState, expectedRevision: number, seedId: string): SeedStateResult {
  if (expectedRevision !== state.revision) return { ok: false, error: "stale_revision" };
  const generation = state.revocationGeneration + 1;
  const scrub = (s: SeedSnapshot): SeedSnapshot => ({ ...s, seeds: s.seeds.filter((seed) => seed.id !== seedId), revocationGeneration: generation });
  return { ok: true, state: { revision: state.revision + 1, revocationGeneration: generation, history: state.history.map(scrub), pending: state.pending ? scrub(state.pending) : null } };
}
