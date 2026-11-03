# Global upload and notes checkpoint

- Detached worktree baseline 87f92259; local commit c58c30e7. No push.
- Global upload and notes links render in desktop and mobile markup; notes point to the Saved notes collection. The collection uses the existing note search helper; browser-local persistence and editor actions remain in place. There is no archive feature in the current model.
- Paper attachment action remains visible independent of readiness. The shared button reports checking/unavailable and offers retry; server-side upload restrictions are unchanged. Duplicate home uploader removed.
- 7 targeted suites, 86 tests passed. Four targeted mutations (notes link, attachment gate, note filter, unavailable message) caused assertion failures; SHA-256 matched before and after restoring each file. These do not establish complete behavioral coverage.
- Targeted ESLint: no errors, four spacing warnings. Typecheck failed because shared dependencies lack mupdf/types, with errors in pdf-engine only.
- Visual and live retry/upload verification remain untested. Subagent IAB visibility unavailable; Turbopack rejected the external node_modules junction. No real account, private input, or paid model used.
