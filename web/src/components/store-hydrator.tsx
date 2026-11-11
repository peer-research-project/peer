"use client";

import { useEffect, useSyncExternalStore } from "react";
import { downloadUnsavedDrafts, downloadNotesRecovery, notesStorageServerSnapshot, notesStorageSnapshot, retryNotesStorage, subscribeNotesStorage } from "@/store/notes-storage-runtime";
import { useProfileStore } from "@/store/profile";
import { useFeedStore } from "@/store/feed";
import { useJevScreeningStore } from "@/store/jev-screening";
import { useNotesStore } from "@/store/notes";
import { useReadingPrefsStore } from "@/store/reading-prefs";
import { useReadingQuestionsStore } from "@/store/reading-questions";
import { useExplainThreadsStore } from "@/store/explain-threads";
import { usePlainRewritesStore } from "@/store/plain-rewrites";
import { useReaderPanesStore } from "@/store/reader-panes";

// The zustand stores use `persist({ skipHydration: true })` so they do NOT
// auto-load localStorage before React hydrates. That keeps the first client
// render identical to the server render (which never sees localStorage),
// avoiding hydration mismatches. We then load the persisted state here, in an
// effect that runs after hydration, which triggers a re-render with the saved
// values. Mount once near the root (in layout.tsx). The shell itself keeps no
// persisted state any more — the sidebar's open/closed flag went with the
// sidebar — so nothing here animates on load.
export function StoreHydrator() {
  useEffect(() => {
    useProfileStore.persist.rehydrate();
    useFeedStore.persist.rehydrate();
    useJevScreeningStore.persist.rehydrate();
    useNotesStore.persist.rehydrate();
    useReadingPrefsStore.persist.rehydrate();
    useReadingQuestionsStore.persist.rehydrate();
    useExplainThreadsStore.persist.rehydrate();
    usePlainRewritesStore.persist.rehydrate();
    useReaderPanesStore.persist.rehydrate();
  }, []);

  const notesStorage = useSyncExternalStore(subscribeNotesStorage, notesStorageSnapshot, notesStorageServerSnapshot);
  if (notesStorage.status !== "error" && notesStorage.status !== "conflict" && !notesStorage.remoteChange) return null;
  return <aside role="status" className="fixed bottom-4 right-4 z-[100] max-w-md rounded-xl bg-surface px-4 py-3 text-sm text-text shadow-lg">
    {notesStorage.status === "error" ? <>
      <p>Notes could not be saved or loaded. Keep this page open and retry; export any edited note before closing.</p>
      <button type="button" onClick={() => useNotesStore.persist.hasHydrated() ? retryNotesStorage() : useNotesStore.persist.rehydrate()}>Retry</button>{" · "}
      <button type="button" onClick={downloadNotesRecovery}>Download old and pending recovery records</button>
      {notesStorage.drafts > 0 && <> · <button type="button" onClick={downloadUnsavedDrafts}>Download unsaved drafts</button></>}
      <p>These recovery records may not include notes already stored in this browser.</p>
    </> : notesStorage.status === "conflict" ? <>
      <p>Notes changed in another tab. Your edits were preserved separately.</p>
      {notesStorage.conflictId && <a href={`/notes/${encodeURIComponent(notesStorage.conflictId)}`}>Open conflict copy</a>}
    </> : <p>Notes changed in another tab. Save your work before refreshing.</p>}
  </aside>;
}
