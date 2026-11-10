# Fresh public source controls — local production build

2026-11-03 approximately 18:09 UTC. Read-only independent local API probe, branch `fixing-bugs-on-uploading-pdf-and-abstract-reading`, source HEAD `27b77c4df22867f94562acdc13823c9066c4c31d`. Running loopback listener `127.0.0.1:4314` was process 9924, `next start --hostname 127.0.0.1 --port 4314`; `.next/required-server-files.json` declares `PEER_BUILD_REF` `27b77c4`, and `.next/BUILD_ID` was `Yv5JuV1UfLmQvZQvWnOEc`. This ties the running local build to the short source ref but is not proof of any hosted deployment.

Executed existing `node docs/handoff/upload-abstract/verify-real-controls.mjs` with `PEER_VERIFY_ORIGIN=http://127.0.0.1:4314`, no auth cookies, private PDF or model requests. Exit 0; raw output `C:/Users/wbc13/AppData/Local/Temp/peer-current-public-controls-27b.log`. Times below include metadata then reading, not just upstream retrieval. Public upstream responses can change; these are current observations, not guarantees.

| Public control | Metadata / reading HTTP | Observed source and reading outcome | Cache and elapsed |
|---|---|---|---|
| `openalex:W7222962933` (DOI `10.1016/j.psep.2026.109758`) | 200 / 200 | Abstract 0 chars, 0 sentences, reading abstract `none`; Semantic Scholar 429 `transient`, Crossref 200 `missing`, publisher 403 `blocked`. Full text `blocked`, blocked host `sciencedirect.com`, no paywall host or source fingerprint. The 403 is a block, not proof of subscription. | Both `no-store`; 2,676 ms. |
| `arxiv:1706.03762` | 200 / 200 | Abstract 1,135 chars, 7 sentences, reading abstract `full`; full text `html`, no blocked/paywall host; fingerprint `y4obqh`. | Metadata `public, s-maxage=3600, stale-while-revalidate=86400`; reading `public, s-maxage=86400, stale-while-revalidate=604800`; 204 ms. |
| `openalex:W7204479535` | 200 / 200 | Abstract 2,023 chars, 11 sentences, reading abstract `full`; full text `none`, no blocked/paywall host; fingerprint `lge7vj`. | Metadata `public, s-maxage=3600, stale-while-revalidate=86400`; reading `public, s-maxage=86400, stale-while-revalidate=604800`; 901 ms. |

These three individual observations support current local public metadata/reading outcomes only. Counts and status do not establish abstract content quality, all source-failure paths, UI behavior, model-call absence in a report, hosted authentication/storage, production database, or a complete independent rubric round. No whole-theme score or acceptance is assigned.
