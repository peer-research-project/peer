import type { Paper } from "@/types";

/** Identifies the exact abstract record used to build a reading. */
export function fingerprintReadingSource(paper: Pick<Paper, "summaryIntro" | "summaryResultDiscussion">): string {
  if (!paper.summaryIntro && !paper.summaryResultDiscussion) return "";
  const source = JSON.stringify([paper.summaryIntro ?? "", paper.summaryResultDiscussion ?? ""]);
  let h = 5381;
  for (let i = 0; i < source.length; i += 1) h = ((h << 5) + h + source.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
