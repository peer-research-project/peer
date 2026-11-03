# Paragraph guide source identity correction

Detached worktree based on `6e88bdeb`; local commits `2bf10097` (guide source key, hook regressions) then `53a447ee` (page import-contract fixture). No push/deployment, no provider/model call.

The guide key now includes `fingerprintReadingSource(paper)` alongside paper ID, attachment ID and revision. Old un-fingerprinted entries remain stored but cannot be reused for the new key. The hook's enabled, body, abort, StrictMode and BYOK behavior remains intact. Tests exercise unchanged ID/revision with changed summary, an existing legacy key, and an old response released after source change; the old request is aborted and its result is not stored. Server guide cache is keyed by `explainDocHash(doc)` over the extracted document; existing route tests cover same document hit and changed document miss, using mock providers.

5 targeted hook/route/gate suites / 90 tests passed; page wiring fixture 1 suite / 10 tests passed. Source-key mutation removing the fingerprint failed targeted assertions; SHA256 restored exactly `ac62f84d16c4043bd401f0a07b9c7e34b8f30b5e908499f1cc69fd9e76d38f84`. Fixture now requires both deep predicate and model hook from the correct module while permitting additional named imports; negative mutations remove each real binding or alter module. CRLF normalization restores the original negative wiring mutations on Windows. Targeted lint passed without warnings. Nonincremental typecheck pending at checkpoint write.

UNVERIFIED follow-up, outside this fix: server cache-hit return appears before the private upload post-read revision recheck; no cross-owner leak or exploit demonstrated. Hosted/real PDF/provider/browser paths not exercised; SQL and deployment acceptance remain open.

Final nonincremental typecheck passed after both commits; worktree clean.
