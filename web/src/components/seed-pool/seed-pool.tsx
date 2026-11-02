"use client";

import { useEffect, useRef, useState } from "react";
import { signInWithGitHub, signInWithGoogle } from "@/components/account/use-auth-user";
import { useSyncGate } from "@/components/profile-sync";
import { forgetSeedPaper, getSeedPool, saveSeedPool, SeedPoolRequestError, uploadSeedPaper, type SeedPoolEditor } from "@/lib/seed-pool/client-api";
import type { SeedPaper } from "@/lib/seed-pool/types";

const MAX_BYTES = 25 * 1024 * 1024;
type FileResult = { name: string; status: "processing" | "ready" | "failed"; message?: string };

export function SeedPool({ onboarding = false }: { onboarding?: boolean }) {
  const auth = useSyncGate((s) => s.authOutcome);
  const owner = useSyncGate((s) => s.authUserId);
  if (auth === "unknown") return <p>Checking your account…</p>;
  if (auth !== "signed-in" || !owner) return <div><p>Sign in to add seed papers. You can skip this optional step.</p>{auth !== "unconfigured" && <div className="flex gap-3"><button type="button" onClick={() => void signInWithGoogle(onboarding ? "/welcome?step=seed" : "/profile#seed-pool")}>Sign in with Google</button><button type="button" onClick={() => void signInWithGitHub(onboarding ? "/welcome?step=seed" : "/profile#seed-pool")}>Sign in with GitHub</button></div>}</div>;
  return <OwnerSeedPool key={owner} onboarding={onboarding} />;
}

/** The key at the caller discards the entire editor immediately on account change. */
export function OwnerSeedPool({ onboarding = false }: { onboarding?: boolean }) {
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
  if (!editor) return <div><p role="status">{notice || "Loading seed papers…"}</p>{notice && <button type="button" onClick={() => { setNotice(""); void reload(); }}>Retry</button>}</div>;
  const pendingCleanup = (editor as SeedPoolEditor & { cleanupPending?: { id: string }[] }).cleanupPending ?? [];
  const toggle = (id: string) => setSelected((old) => old.includes(id) ? old.filter((v) => v !== id) : old.length < 5 ? [...old, id] : old);
  return <div className="space-y-4 text-body-sm" data-enter-scope>
    <p>Optional: choose 3–5 distinct papers that represent your interests. One to five works. These private PDFs are separate from your reading uploads; no AI report is created.</p>
    <p>Without seed papers, your briefing uses your other preferences. Seed matching is an initial approach, not a quality guarantee.</p>
    <section><h3>Active today</h3><PaperList papers={editor.snapshot?.seeds ?? []} /><p>{editor.ownerLocalDate && editor.timezone ? `${editor.ownerLocalDate} · ${editor.timezone}` : "Date unavailable"}</p></section>
    {editor.pending && <section><h3>Pending</h3><PaperList papers={editor.pending.seeds} /><p>Effective {editor.pending.effectiveLocalDate} · {editor.timezone ?? "timezone unavailable"}</p><button type="button" disabled={busy} onClick={() => void save(true)}>Undo pending changes</button></section>}
    <fieldset disabled={busy}><legend>Next pool ({selected.length}/5)</legend><p>Removing a paper here changes the next pool; it is not a dislike and does not delete the PDF.</p>
      {editor.availableAssets.map((paper) => <div key={paper.id} className="my-3 rounded-md border border-border p-3"><label><input type="checkbox" checked={selected.includes(paper.id)} disabled={!selected.includes(paper.id) && selected.length >= 5} onChange={() => toggle(paper.id)} /> {paper.title}</label><Facets paper={paper} /><button type="button" onClick={() => setConfirmForget(paper.id)}>Forget this PDF and its recommendations</button>{confirmForget === paper.id && <div role="alert"><p>Permanently forget this seed PDF and its derived recommendations? Notes and your reading library will not be deleted.</p><button type="button" onClick={() => void forget(paper.id, editor.revision!)}>Confirm forget</button> <button type="button" onClick={() => setConfirmForget(null)}>Cancel</button></div>}</div>)}
      <label className="block"><input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} /> I have the right to upload these PDFs for private processing.</label>
      <label className="block">Add PDFs <input type="file" accept="application/pdf,.pdf" multiple onChange={(e) => { const selectedFiles = Array.from(e.target.files ?? []); e.target.value = ""; void addFiles(selectedFiles); }} /></label>
    </fieldset>
    {files.length > 0 && <ul aria-live="polite">{files.map((file, i) => <li key={`${file.name}-${i}`}>{file.name}: {file.status}{file.message ? ` — ${file.message}` : ""}</li>)}</ul>}
    <button type="button" disabled={busy || editor.revision === null || (selected.length === 0 && !editor.snapshot && !editor.pending)} onClick={() => void save()}>Save pool</button>
    {pendingCleanup.length > 0 && <section aria-label="Pending file cleanup">
      <p>Recommendation use has been revoked for {pendingCleanup.length} {pendingCleanup.length === 1 ? "paper" : "papers"}. File cleanup is pending.</p>
      {pendingCleanup.map((item, index) => <button key={item.id} type="button" disabled={busy || editor.revision === null} onClick={() => void forget(item.id, editor.revision!)}>Retry file cleanup {index + 1}</button>)}
    </section>}
    {cleanup && !pendingCleanup.some((item) => item.id === cleanup.id) && <button type="button" disabled={busy} onClick={() => void forget(cleanup.id, cleanup.revision)}>Retry file cleanup</button>}
    {notice && <p role="status">{notice}</p>}
    {onboarding && <p>You can skip and add papers later in Profile.</p>}
  </div>;
}
function Facets({ paper }: { paper: SeedPaper }) { return <div>{([ ["Topic", paper.features.topic], ["Research object", paper.features.object], ["Methods", paper.features.method] ] as const).map(([label, values]) => <p key={label}>{label}: {values.length ? values.join(", ") : "Not recognized"}</p>)}</div>; }
function PaperList({ papers }: { papers: SeedPaper[] }) { return papers.length ? <ul>{papers.map((paper) => <li key={paper.id}><strong>{paper.title}</strong><Facets paper={paper} /></li>)}</ul> : <p>No seed papers.</p>; }
