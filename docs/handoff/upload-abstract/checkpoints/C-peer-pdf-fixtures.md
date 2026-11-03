# Peer PDF fixture extraction — local partial evidence

2026-11-03. Actual imports ran from main `27b77c4df22867f94562acdc13823c9066c4c31d`; working tree code for the imported extractor, seed features, state and scorer matches retained worktree `e210389673677b54a0c92eb57b74ea8ebff3677e`. Fixture inputs are the invented PDFs in the main checkout's `docs/handoff/upload-abstract/checkpoints/hosted-fixtures/`. No real private inputs, external model, DOI lookup, browser, upload, live database or service writes. Global `fetch` was guarded and asserted unused.

One invented Vitest probe invoked actual `extractPdfTextFromBytes` and, for readable results, actual `seedFromExtractedDocument`; then actual `groupSeedCopies` and pure `setSeedPool`. Result: one test passed. Raw exact probe, config and full output: `C:/Users/wbc13/AppData/Local/Temp/peer-pdf-fixture-probe.test.ts`, `peer-pdf-fixture-probe.config.ts`, `peer-pdf-fixture-probe-final.log`. Initial weaker exploratory pass is retained as `peer-pdf-fixture-probe.log`.

| Fixture | SHA-256 | Peer extraction and seed result |
|---|---|---|
| fictional-canopy.pdf | `7debdfb4876c8b63d84633ddfa43a451ff39803a77764d4cd29eb4bed541a5c7` | Readable; title `Fictional study: forest canopy water retention`; section body 2,204 characters; nonempty topic facets including canopy; object and method arrays empty. |
| fictional-battery.pdf | `0b98ec96364cd77d7ade7921cc0e5cac937f86be4f12eb7637b33e3e2f0acc34` | Readable; title `Fictional study: battery electrolyte stability`; section body 2,124 characters; topic and electrolyte object facets plus `impedance spectroscopy` method. |
| blank-no-text.pdf | `0d812aa5250f5f6394d37e0d2da761894f65457da3d934d65b35bd9d1847dbbc` | Extraction fails with `no-text-layer`, no seed created. |

Exact copied canopy bytes yielded a separate generated seed ID but the same content hash and canonical key; the scorer grouped both as one and the pure pool state rejected them as duplicate. A separately invented alias with different hash and the same canonical key was also grouped/rejected; distinct canopy and battery seeds remained separate. The canonical-alias scenario is a constructed state fixture, not verified DOI resolution or an actual independently obtained public-paper copy.

**Limit:** extraction is not a recommendation-quality benchmark: some topic facets reflect repeated synthetic prose and generic fixture wording, and canopy did not produce object or method facets. No hosted endpoint, private storage, authentication, migration, RLS, real concurrency or UI interaction was exercised. This is local partial evidence, not hosted acceptance or a full Theme C PASS.
