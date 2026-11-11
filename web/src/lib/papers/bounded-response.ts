/** Read a response without buffering more than the accepted number of bytes. */
export async function readBoundedResponse(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Buffer | null> {
  if (signal.aborted) throw new Error("Response timed out.");
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  // Keep one growing buffer rather than one object per network chunk. A
  // source can otherwise make millions of tiny chunks consume far more
  // memory than the byte limit, even though its payload is small enough.
  let bytes = Buffer.allocUnsafe(Math.min(maxBytes, 64 * 1024));
  let size = 0;
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new Error("Response timed out."));
    signal.addEventListener("abort", onAbort, { once: true });
    // Account for an abort between the initial check and registering the listener.
    if (signal.aborted) onAbort();
  });
  try {
    for (;;) {
      const { value, done } = await Promise.race([reader.read(), aborted]);
      if (done) return size === bytes.length ? bytes : Buffer.from(bytes.subarray(0, size));
      const nextSize = size + value.byteLength;
      if (nextSize > maxBytes) return null;
      if (nextSize > bytes.length) {
        const capacity = Math.min(maxBytes, Math.max(nextSize, bytes.length * 2));
        const expanded = Buffer.allocUnsafe(capacity);
        bytes.copy(expanded, 0, 0, size);
        bytes = expanded;
      }
      bytes.set(value, size);
      size = nextSize;
    }
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
    // Do not wait on a hostile or stalled stream's cancellation callback.
    void reader.cancel().catch(() => {});
  }
}
