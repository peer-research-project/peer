# Upload, source repairs and Seed Pool rollout

Branch: `fixing-bugs-on-uploading-pdf-and-abstract-reading`.

This is an operational handoff. The latest human instruction explicitly authorizes creating a PR and then merging it. Root pushed the approved branch and created [PR40](https://github.com/peer-research-project/peer/pull/40), and owns exact-head rechecks and the merge. This checkpoint does not assert that merge or deployment has completed and does not authorize production SQL. Local verification remains recorded in `ABC-UPLOAD-ABSTRACT-REPAIR.md` and `EVIDENCE-INDEX.md`; the97.9-per-theme, two-independent-round acceptance gate remains open.

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

Reviewable source: `web/supabase/migrations/20261102000000_seed_pool.sql`.

The migration has not been executed. It builds on the existing Peer Supabase schema, including profiles, dashboard batches and delivery tables/functions. Validate it against the matching existing schema in a non-production environment before considering production application. SQL-text tests and mocked RPCs do not establish syntax, RLS isolation, transaction locking or concurrent-edit behavior.

With the seed schema explicitly absent, existing feed, email and prepared-job paths retain legacy no-seed behavior. The seed editor reports that seed papers are unavailable and permits retry. A general database outage is an error; it must not be treated as an empty seed pool.

## Remaining rollout order

1. Root commits/pushes the bounded handoff update, rechecks PR40 at the exact head and completes the human-authorized merge while preserving owner history. Record the actual merge result; no implementation or broad test rerun is part of this operational update.
2. Observe and record any existing CI/CD deployment outcome. A successful merge does not establish deployment success or product acceptance. With the seed schema explicitly absent, the no-seed fallback and unavailable seed editor described above still apply.
3. Validate the migration on an authorized existing-schema non-production database. Exercise two-owner isolation, stale revisions, concurrent edits, first-briefing protection, next-owner-local-day activation, DST, future prepared jobs and forget/cleanup fences. This has not run.
4. Obtain separate explicit owner authorization before production SQL application or a manual production deployment. Then apply the validated migration to the intended target using its normal migration process. PR40 authorization does not supply this SQL permission.
5. Verify the actual deployed product with authenticated test accounts and invented/public PDFs: global upload, attaching a PDF to a paper, reading extracted text, Notes persistence, seed upload/edit/undo, owner separation, owner-date web/email/prepared parity and explicit forget. These hosted gates remain unrun. Exercise Deep Report only with that user's authorized model key; never substitute a site-operator model key.

Record real outcomes separately from fixtures. Failed and unrun checks remain visible; deployment alone does not close acceptance.
