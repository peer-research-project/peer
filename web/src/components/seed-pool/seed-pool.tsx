"use client";

import { useEffect, useRef, useState } from "react";
import { signInWithGitHub, signInWithGoogle } from "@/components/account/use-auth-user";
import { useSyncGate } from "@/components/profile-sync";
import { forgetSeedPaper, getSeedPool, saveSeedPool, SeedPoolRequestError, uploadSeedPaper, type SeedPoolEditor } from "@/lib/seed-pool/client-api";
import type { SeedPaper } from "@/lib/seed-pool/types";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const MAX_BYTES = 25 * 1024 * 1024;
type FileResult = { name: string; status: "processing" | "ready" | "failed"; message?: string };

// D-C2-1: the pool is drawn with the app's own primitives — the pill grammar
// (`buttonVariants`, applied to native <button>s so the element stays a plain
// button), the Profile's card surface, the `eyebrow` label, and the text
// actions' touch rule (P9-23/P9-52: `[@media(hover:none)]:min-h-11`, 44 px
// where there is no hover, nothing moves for a mouse).
const TOUCH_FLOOR = "[@media(hover:none)]:min-h-11";
const CARD = "rounded-2xl bg-surface shadow-card px-4 py-4 sm:px-6 sm:py-5 min-w-0";
const HEADING = "eyebrow text-accent/90";
const PRIMARY_ACTION = cn(buttonVariants({ tone: "primary", size: "md" }), TOUCH_FLOOR);
const SOFT_ACTION = cn(buttonVariants({ tone: "soft", size: "sm" }), TOUCH_FLOOR);
const SIGN_IN_ACTION = cn(buttonVariants({ tone: "surface", size: "md" }), TOUCH_FLOOR);
// The same text action as "Delete PDF" in the private-PDF list: quiet, underlined, red on hover.
const FORGET_ACTION = cn("inline-flex items-center text-left text-caption text-text-muted underline underline-offset-4 hover:text-red transition-colors", TOUCH_FLOOR);
// The second step of a two-step control, as "Confirm reset" / "Cancel" on the Profile page (P9-54).
const CONFIRM_ACTION = cn("text-red hover:text-red/80 font-medium transition-[color,background-color,border-color,scale] active:scale-95", TOUCH_FLOOR);
const CANCEL_ACTION = cn("text-text-faint hover:text-text-muted transition-[color,background-color,border-color,scale] active:scale-95", TOUCH_FLOOR);
// The native file input stays in the label, visually hidden but focusable and named by the label's words; the label
// wears the pill and draws the keyboard ring the global :focus-visible rule would draw on a button.
const FILE_PICKER = cn(
  buttonVariants({ tone: "accentSoft", size: "md" }),
  "cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-accent has-[:disabled]:opacity-55 has-[:disabled]:cursor-wait",
  TOUCH_FLOOR,
);
const CHECK_ROW = cn("flex items-start gap-3 cursor-pointer", TOUCH_FLOOR);
const CHECKBOX = "mt-1 size-4 shrink-0 accent-[color:var(--color-accent)]";
const FILE_STATUS: Record<FileResult["status"], string> = {
  processing: "text-text-faint",
  ready: "text-[color:var(--color-positive)]",
  // The error line's own style, as the upload button's failure message.
  failed: "text-red",
};

export function SeedPool({ onboarding = false, onProgress }: { onboarding?: boolean; onProgress?: (state: { busy: boolean; dirty: boolean }) => void }) {
  const auth = useSyncGate((s) => s.authOutcome);
  const owner = useSyncGate((s) => s.authUserId);
  if (auth === "unknown") return <p className="text-body-sm text-text-faint">Checking your account…</p>;
  if (auth !== "signed-in" || !owner) return <div className="space-y-3 text-body-sm text-text-muted"><p className="leading-relaxed measure-ui">Sign in to add seed papers. You can skip this optional step.</p>{auth !== "unconfigured" && <div className="flex flex-wrap gap-3"><button type="button" className={SIGN_IN_ACTION} onClick={() => void signInWithGoogle(onboarding ? "/welcome?step=seed" : "/profile#seed-pool")}>Sign in with Google</button><button type="button" className={SIGN_IN_ACTION} onClick={() => void signInWithGitHub(onboarding ? "/welcome?step=seed" : "/profile#seed-pool")}>Sign in with GitHub</button></div>}</div>;
  return <OwnerSeedPool key={owner} onboarding={onboarding} onProgress={onProgress} />;
}

/** The key at the caller discards the entire editor immediately on account change. */
export function OwnerSeedPool({ onboarding = false, onProgress }: { onboarding?: boolean; onProgress?: (state: { busy: boolean; dirty: boolean }) => void }) {
  const [editor, setEditor] = useState<SeedPoolEditor | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<FileResult[]>([]);
  const [notice, setNotice] = useState("");
  const [confirmForget, setConfirmForget] = useState<string | null>(null);
  const [cleanup, setCleanup] = useState<{ id: string; revision: number } | null>(null);
  const alive = useRef(true);
  const generation = useRef(0);
  const savedIds = (editor?.pending ?? editor?.snapshot)?.seeds.map((paper) => paper.id) ?? [];
  const dirty = !!editor && (selected.length !== savedIds.length || selected.some((id) => !savedIds.includes(id)));
  useEffect(() => { onProgress?.({ busy, dirty }); }, [onProgress, busy, dirty]);
  useEffect(() => () => onProgress?.({ busy: false, dirty: false }), [onProgress]);
  useEffect(() => {
    alive.current = true;
    const current = ++generation.current;
    void getSeedPool().then((next) => {
      if (!alive.current || generation.current !== current) return;
      setEditor(next); setSelected((next.pending ?? next.snapshot)?.seeds.map((p) => p.id) ?? []);
    }).catch((error: unknown) => { if (alive.current && generation.current === current) setNotice(error instanceof SeedPoolRequestError && error.status === 401 ? "Please sign in again to manage seed papers." : "Seed papers are unavailable. Try again."); });
    return () => { alive.current = false; };
  }, []);
  const reload = async () => {
    const current = ++generation.current;
    try {
      const next = await getSeedPool();
      if (!alive.current || generation.current !== current) return false;
      setEditor(next); setSelected((next.pending ?? next.snapshot)?.seeds.map((p) => p.id) ?? []);
      return true;
    } catch { if (alive.current && generation.current === current) { setEditor(null); setNotice("Seed papers are unavailable. Try again."); } return false; }
  };
  const handleError = async (error: unknown) => {
    if (!alive.current) return;
    if (error instanceof SeedPoolRequestError && error.status === 409) {
      await reload(); if (alive.current) setNotice("This pool changed elsewhere. The latest version is shown; review your edits and try again.");
    } else if (error instanceof SeedPoolRequestError && error.status === 401) setNotice("Please sign in again to manage seed papers.");
    else setNotice(error instanceof Error ? error.message : "Seed papers are unavailable. Try again.");
  };
  const addFiles = async (chosen: File[]) => {
    if (!editor || busy) return;
    if (!rights) { setNotice("Confirm you have the right to upload these PDFs first."); return; }
    if (chosen.length === 0) return;
    if (chosen.length + selected.length > 5) { setNotice("Choose at most five papers in the pool."); return; }
    setNotice(""); setBusy(true);
    const results: FileResult[] = chosen.map((file) => ({ name: file.name, status: "processing" }));
    setFiles([...results]);
    const added: SeedPaper[] = [];
    let stale = false;
    for (let i = 0; i < chosen.length; i++) {
      if (!alive.current) return;
      const file = chosen[i];
      try {
        if (!(file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))) throw new Error("Choose a PDF file.");
        if (file.size > MAX_BYTES) throw new Error("The PDF is larger than 25 MB.");
        const paper = await uploadSeedPaper(file);
        if (!alive.current) return;
        if (!paper?.id || !paper.title || !paper.features || ![...paper.features.topic, ...paper.features.object, ...paper.features.method].length) throw new Error("No usable text was recognized. Try a different PDF.");
        if (editor.availableAssets.some((p) => p.canonicalKey === paper.canonicalKey || p.contentHash === paper.contentHash) || added.some((p) => p.canonicalKey === paper.canonicalKey || p.contentHash === paper.contentHash)) throw new Error("This paper is already in your available papers.");
        added.push(paper); results[i] = { name: file.name, status: "ready" };
      } catch (error) {
        if (error instanceof SeedPoolRequestError && error.status === 409) stale = true;
        results[i] = { name: file.name, status: "failed", message: error instanceof Error ? error.message : "Could not process this PDF." };
      }
      if (alive.current) setFiles([...results]);
    }
    if (!alive.current) return;
    setEditor((old) => old ? { ...old, availableAssets: [...old.availableAssets, ...added] } : old);
    setSelected((old) => [...old, ...added.map((p) => p.id)]);
    if (stale) { await reload(); if (alive.current) setNotice("This pool changed elsewhere. The latest version is shown; review your edits and try again."); }
    if (alive.current) setBusy(false);
  };
  const save = async (undo = false) => {
    if (!editor || editor.revision === null || busy) return;
    setBusy(true); setNotice("");
    try { await saveSeedPool(editor.revision, selected, undo); if (!alive.current) return; const loaded = await reload(); if (alive.current && loaded) setNotice(undo ? "Pending changes undone." : "Pool saved."); }
    catch (error) { await handleError(error); }
    finally { if (alive.current) setBusy(false); }
  };
  const forget = async (id: string, revision: number) => {
    if (busy) return; setBusy(true); setNotice("");
    try {
      const result = await forgetSeedPaper(id, revision);
      if (!alive.current) return;
      setCleanup(null); setConfirmForget(null); const loaded = await reload(); if (alive.current && loaded) setNotice(result.status === "forgotten" ? "The seed PDF and its derived recommendation data were forgotten." : "Cleanup is still pending.");
    } catch (error) {
      if (!alive.current) return;
      const detail = error instanceof SeedPoolRequestError ? error.detail : null;
      if (error instanceof SeedPoolRequestError && error.status === 503 && detail && typeof detail === "object" && "status" in detail && detail.status === "cleanup_pending" && "revision" in detail && typeof detail.revision === "number") {
        setCleanup({ id, revision: detail.revision }); setConfirmForget(null); await reload(); if (alive.current) setNotice("Recommendation use has been revoked. File cleanup is pending; retry to complete it.");
      } else await handleError(error);
    } finally { if (alive.current) setBusy(false); }
  };
  if (!editor) return <div className="space-y-3 text-body-sm"><p role="status" className="text-text-muted">{notice || "Loading seed papers…"}</p>{notice && <button type="button" className={SOFT_ACTION} onClick={() => { setNotice(""); void reload(); }}>Retry</button>}</div>;
  const pendingCleanup = (editor as SeedPoolEditor & { cleanupPending?: { id: string }[] }).cleanupPending ?? [];
  const toggle = (id: string) => setSelected((old) => old.includes(id) ? old.filter((v) => v !== id) : old.length < 5 ? [...old, id] : old);
  return <div className="space-y-5 min-w-0 text-body-sm text-text-muted" data-enter-scope>
    <div className="space-y-2">
      <p className="leading-relaxed measure-ui">Optional: choose 3–5 distinct papers that represent your interests. One to five works. These private PDFs are separate from your reading uploads; no AI report is created.</p>
      <p className="text-caption text-text-faint leading-relaxed measure-ui">Without seed papers, your briefing uses your other preferences. Seed matching is an initial approach, not a quality guarantee.</p>
    </div>
    <section className={CARD}><h3 className={HEADING}>Active today</h3><PaperList papers={editor.snapshot?.seeds ?? []} /><p className="mt-3 font-mono text-caption text-text-faint wrap-anywhere">{editor.ownerLocalDate && editor.timezone ? `${editor.ownerLocalDate} · ${editor.timezone}` : "Date unavailable"}</p></section>
    {editor.pending && <section className={CARD}><h3 className={HEADING}>Pending</h3><PaperList papers={editor.pending.seeds} /><p className="mt-3 font-mono text-caption text-text-faint wrap-anywhere">Effective {editor.pending.effectiveLocalDate} · {editor.timezone ?? "timezone unavailable"}</p><button type="button" className={cn(SOFT_ACTION, "mt-3")} disabled={busy} onClick={() => void save(true)}>Undo pending changes</button></section>}
    <div className={CARD}><fieldset disabled={busy} className="min-w-0 space-y-3"><legend className={cn(HEADING, "mb-1")}>Next pool ({selected.length}/5)</legend><p className="text-caption text-text-faint leading-relaxed">Removing a paper here changes the next pool; it is not a dislike and does not delete the PDF.</p>
      {editor.availableAssets.map((paper) => <div key={paper.id} className="min-w-0 rounded-xl border border-border p-3"><label className={CHECK_ROW}><input type="checkbox" className={CHECKBOX} checked={selected.includes(paper.id)} disabled={!selected.includes(paper.id) && selected.length >= 5} onChange={() => toggle(paper.id)} /> <span className="min-w-0 font-medium text-heading wrap-anywhere">{paper.title}</span></label><Facets paper={paper} /><button type="button" className={cn(FORGET_ACTION, "mt-2")} onClick={() => setConfirmForget(paper.id)}>Forget this PDF and its recommendations</button>{confirmForget === paper.id && <div role="alert" className="mt-3 rounded-xl bg-red/[0.05] px-4 py-3 text-meta"><p className="text-text-muted leading-relaxed">Permanently forget this seed PDF and its derived recommendations? Notes and your reading library will not be deleted.</p><div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1"><button type="button" className={CONFIRM_ACTION} onClick={() => void forget(paper.id, editor.revision!)}>Confirm forget</button> <button type="button" className={CANCEL_ACTION} onClick={() => setConfirmForget(null)}>Cancel</button></div></div>}</div>)}
      <label className={cn(CHECK_ROW, "text-body-sm text-text-muted")}><input type="checkbox" className={CHECKBOX} checked={rights} onChange={(e) => setRights(e.target.checked)} /> <span className="min-w-0">I have the right to upload these PDFs for private processing.</span></label>
      <label className={FILE_PICKER}>Add PDFs <input type="file" className="sr-only" accept="application/pdf,.pdf" multiple onChange={(e) => { const selectedFiles = Array.from(e.target.files ?? []); e.target.value = ""; void addFiles(selectedFiles); }} /></label>
    </fieldset></div>
    {files.length > 0 && <ul aria-live="polite" className="space-y-1 font-mono text-caption">{files.map((file, i) => <li key={`${file.name}-${i}`} data-status={file.status} className={cn("wrap-anywhere", FILE_STATUS[file.status])}>{file.name}: {file.status}{file.message ? ` — ${file.message}` : ""}</li>)}</ul>}
    <button type="button" className={PRIMARY_ACTION} disabled={busy || editor.revision === null || (selected.length === 0 && !editor.snapshot && !editor.pending)} onClick={() => void save()}>Save pool</button>
    {pendingCleanup.length > 0 && <section aria-label="Pending file cleanup" className="space-y-2 rounded-xl bg-red/[0.05] px-4 py-3">
      <p className="leading-relaxed">Recommendation use has been revoked for {pendingCleanup.length} {pendingCleanup.length === 1 ? "paper" : "papers"}. File cleanup is pending.</p>
      <div className="flex flex-wrap gap-2">{pendingCleanup.map((item, index) => <button key={item.id} type="button" className={SOFT_ACTION} disabled={busy || editor.revision === null} onClick={() => void forget(item.id, editor.revision!)}>Retry file cleanup {index + 1}</button>)}</div>
    </section>}
    {cleanup && !pendingCleanup.some((item) => item.id === cleanup.id) && <button type="button" className={SOFT_ACTION} disabled={busy} onClick={() => void forget(cleanup.id, cleanup.revision)}>Retry file cleanup</button>}
    {notice && <p role="status" className="text-body-sm text-text">{notice}</p>}
    {onboarding && <p className="text-caption text-text-faint">You can skip and add papers later in Profile.</p>}
  </div>;
}
function Facets({ paper }: { paper: SeedPaper }) { return <div className="mt-2 space-y-1 text-caption text-text-faint">{([ ["Topic", paper.features.topic], ["Research object", paper.features.object], ["Methods", paper.features.method] ] as const).map(([label, values]) => <p key={label} className="wrap-anywhere">{label}: {values.length ? values.join(", ") : "Not recognized"}</p>)}</div>; }
function PaperList({ papers }: { papers: SeedPaper[] }) { return papers.length ? <ul className="mt-3 space-y-3">{papers.map((paper) => <li key={paper.id} className="min-w-0"><strong className="font-medium text-heading wrap-anywhere">{paper.title}</strong><Facets paper={paper} /></li>)}</ul> : <p className="mt-2 text-text-faint">No seed papers.</p>; }
