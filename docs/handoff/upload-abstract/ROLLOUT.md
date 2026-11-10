# Upload, source repairs and Seed Pool rollout

Branch: `fixing-bugs-on-uploading-pdf-and-abstract-reading`.

PR40 merged at2026-11-03T16:26:14Z into main`9ce33c16fd1a95d1a1e24b43a1dfb2c0cd3eccf2`; merge is verified, production deployment is not. The human subsequently authorized test-environment validation FIRST, then production migration/deployment and all remaining acceptance. That conditional production authority already exists; do not ask again after its test conditions truly pass. The human also requires fixing all51full-suite failures and1lint error, not accepting them as baseline. See the living `HANDOFF-CLAUDE-PEER-ROLLOUT.md` for current units/evidence;97.9-per-theme/two-independent-round acceptance remains OPEN.

Two retained worker groups are active: full minimal migration/runtime validation and full test/lint repairs. Root exclusively owns live Vercel/Supabase/browser/external mutations and coordinates follow-up source publication. No duplicate PR40/merge, unauthorized new branch, app dependency or worker push. Preserve the dirty handoff documents and all failed evidence.

## Upload configuration already prepared

The Vercel project's **Production** configuration contains:

```text
PEER_UPLOADS_ENABLED=true
PEER_UPLOAD_BUCKET=private-uploads
```

The matching Supabase project has a private `private-uploads` bucket with a 25 MiB file limit. Configuration presence and bucket metadata were checked; these checks did not upload a file. Existing Supabase URL, publishable-key and server-only service-role variable names were present. Never copy service-role values into this document or client code.

Production deployment has not been verified at this checkpoint. Saved variables take effect in a new deployment; changing the configuration or creating/merging a PR does not itself prove the running deployment or hosted behavior. Observe any existing CI/CD deployment separately.

The repaired UI keeps the global upload action and paper attachment action visible while checking readiness or reporting an unavailable backend. The backend still requires authenticated access and usable private storage. A visible button does not establish successful upload or Deep Report generation.

## Database change to validate

Actual production metadata lacks dashboard batches/deliveries/rollover tables, both prerequisite RPCs and`briefing_deliveries.local_date`. **Seed SQL alone is NO-GO** (real isolated transaction reproduced missing-table failure and rollback). Required tested closure, in order:

1. `20260924000000_dashboard_delivery_ledger.sql`
2. `20260924000300_briefing_deliveries_dedupe.sql`
3. `20260924000500_dashboard_rollover.sql`
4. Corrected `20261102000000_seed_pool.sql`

Real isolated PostgreSQL17.11 tests have applied/reapplied this closure to a metadata-shaped baseline, preserving duplicate historical NULL-date deliveries and exercising permissions/lifecycle/date/real locks. A real duplicate-claim failure led to local fix93673ab4 in the new seed migration; the PR40 seed SQL is therefore not the rollout payload. Raw corrected worktree SHA1DF1C5C65BF78B5F827069D9C96203373255BB4EA7B88FAFBB64E0B84E20F30D is not yet final GO: sequence/creator-capability parity, canonical LF payload hash, manager replay and coordinated publication remain pending. No production DDL has run. Auth/storage/email platform proof remains separate.

With the seed schema explicitly absent, existing feed, email and prepared-job paths retain legacy no-seed behavior. The seed editor reports that seed papers are unavailable and permits retry. A general database outage is an error; it must not be treated as an empty seed pool.

## Remaining rollout order

1. Finish all test/lint repairs, manager verification and source publication coordinated by root; do not publish old SQL or silently weaken assertions.
2. Complete production-metadata/security/sequence parity and exact canonical four-file replay with invented users, retained history and all delivery/forget races; record each SQL SHA and explicit GO/NO-GO.
3. Verify isolated app/deployment preflight and target identity. Preview must not inherit production Supabase credentials for test writes. Record any existing CI/CD outcome separately; merge alone is not deployment.
4. After test conditions pass, root executes the already-authorized production deployment/migration in a reviewed order. Prefer verified new code with missing-schema fallback before revoking legacy RPC access, and handle any old-worker compatibility window. No production-data deletion or unrelated migrations. Do not ask for the same conditional permission again.
5. Verify the actual deployed product with authenticated test accounts and invented/public PDFs: global upload, attaching a PDF to a paper, reading extracted text, Notes persistence, seed upload/edit/undo, owner separation, owner-date web/email/prepared parity and explicit forget. These hosted gates remain unrun. Exercise Deep Report only with that user's authorized model key; never substitute a site-operator model key.

Record real outcomes separately from fixtures. Failed and unrun checks remain visible; deployment alone does not close acceptance.
