# Upload, source repairs and Seed Pool rollout

Branch: `fixing-bugs-on-uploading-pdf-and-abstract-reading`.

This is an operational handoff, not authorization to publish or apply SQL. Local implementation and verification are recorded in `ABC-UPLOAD-ABSTRACT-REPAIR.md` and `EVIDENCE-INDEX.md`. The 97.9-per-theme, two-independent-round acceptance gate remains open.

## Upload configuration already prepared

The Vercel project's **Production** configuration contains:

```text
PEER_UPLOADS_ENABLED=true
PEER_UPLOAD_BUCKET=private-uploads
```

The matching Supabase project has a private `private-uploads` bucket with a 25 MiB file limit. Configuration presence and bucket metadata were checked; these checks did not upload a file. Existing Supabase URL, publishable-key and server-only service-role variable names were present. Never copy service-role values into this document or client code.

No production deployment was performed. Saved variables take effect in a new deployment; changing the configuration does not update the currently running deployment.

The repaired UI keeps the global upload action and paper attachment action visible while checking readiness or reporting an unavailable backend. The backend still requires authenticated access and usable private storage. A visible button does not establish successful upload or Deep Report generation.

## Database change to validate

Reviewable source: `web/supabase/migrations/20261102000000_seed_pool.sql`.

The migration has not been executed. It builds on the existing Peer Supabase schema, including profiles, dashboard batches and delivery tables/functions. Validate it against the matching existing schema in a non-production environment before considering production application. SQL-text tests and mocked RPCs do not establish syntax, RLS isolation, transaction locking or concurrent-edit behavior.

With the seed schema explicitly absent, existing feed, email and prepared-job paths retain legacy no-seed behavior. The seed editor reports that seed papers are unavailable and permits retry. A general database outage is an error; it must not be treated as an empty seed pool.

## Remaining rollout order

1. Finish local repairs and independent review, recording the actual commit and check results.
2. Validate the migration on an existing-schema non-production database. Exercise two-owner isolation, stale revisions, concurrent edits, first-briefing protection, next-owner-local-day activation, DST, future prepared jobs and forget/cleanup fences.
3. Obtain explicit owner authorization for the concrete database application and publishing actions. The current task does not authorize production SQL, push, PR, merge or deployment.
4. Apply the reviewed migration to the intended target using its normal migration process, then publish the reviewed code through the authorized repository/deployment workflow. A new production deployment activates the upload configuration above.
5. Verify the deployed product with authenticated test accounts and invented/public PDFs: global upload, attaching a PDF to a paper, reading extracted text, Notes persistence, seed upload/edit/undo, owner separation, owner-date web/email/prepared parity and explicit forget. Exercise Deep Report only with that user's authorized model key. Never substitute a site-operator model key.

Record real outcomes separately from fixtures. Failed and unrun checks remain visible; deployment alone does not close acceptance.
