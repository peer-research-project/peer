const failedWrites = new Set<string>();
export const READING_IDENTITY_EVENT = "peer-reading-identity-changed";

/** Last reading identity observed in this browser. No paper text is stored here. */
export function readingIdentityStorageKey(paperId: string): string {
  return `peer-reading-current-v1:${encodeURIComponent(paperId)}`;
}

export function observedReadingKey(paperId: string, storage: Pick<Storage, "getItem">): string | null {
  try {
    if (failedWrites.has(paperId)) return null;
    const key = storage.getItem(readingIdentityStorageKey(paperId));
    return key?.startsWith(`${paperId}|`) ? key : null;
  } catch {
    return null;
  }
}

export function recordReadingKey(paperId: string, key: string, storage: Pick<Storage, "setItem">): void {
  try {
    storage.setItem(readingIdentityStorageKey(paperId), key);
    failedWrites.delete(paperId);
  } catch {
    // A readable but unwritable store may still contain yesterday's marker.
    failedWrites.add(paperId);
  }
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new Event(READING_IDENTITY_EVENT));
  }
}
