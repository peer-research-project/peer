# Isolated Seed Pool SQL harness

This folder contains the selected synthetic local tests and the exact four-file LF transaction payload. It contains no database files, server binaries, credentials, production user rows, catalog exports, or logs. It does not authorize production SQL. Root owns all live Supabase and Vercel actions. The source of truth for failures and current state is `../checkpoints/C-seed-sql-runtime.md` plus the rollout handoff.

The bundle is **prepared, not yet replayed with production sequence metadata**. SHA-256 must be `F1D16D710C9B451CE90F5F3254B80DFE9D0A566779EC2485C51207BAEAC5745A`. `seed-closure-manifest.json` pins order and both canonical Git-blob LF and historical Windows worktree hashes; the seed LF file hash is `B7AC3E004C2D9E144BF2F131E6ADB7AC841738FCC73B2710252F30DBAA5FBB4C`. A local `.gitattributes` marks the transaction payload binary to preserve exact bytes. Do not reconstruct its line endings or paste altered text into a live SQL editor and call it this tested payload.

## Safety and starting point

All mutating harness SQL is prefixed with a guard that errors unless the server is `127.0.0.1:55479`, database `peer_prodmeta_secure`, and data directory is exactly `C:/Users/wbc13/AppData/Local/Temp/peer-seed-pg-runtime/data`. `invoke-local.ps1` and `concurrency-secure.py` independently check that same target before changes. The canonical bundle is immutable and therefore has no prepended guard: execute it locally **only through** `invoke-local.ps1 -Action bundle`. Never point any harness script at a remote endpoint or production database. `python` and `psql` invocations below use only this isolated cluster. `-Action tests` is for a newly replayed baseline; it inserts invented rows and its concurrency script intentionally leaves invented UUID users in the task-local database.

The known EDB 17.11 portable Windows archive is `https://get.enterprisedb.com/postgresql/postgresql-17.11-5-windows-x64-binaries.zip`. EDB's `.zip.sha256` matched `80379B2C04D51C30225532E0AE04509899141E9957ED096FE749D7FD9DF8F82F`; the extracted postgres.exe was not Authenticode signed. Prior initial startup failed from a quoted `-o` argument; the corrected startup is shown below. Do not add binaries to PATH, install a service, use an administrator install, copy `.env` secrets, or use real data.

The scripts intentionally target the existing task directory and exact Windows user path; adapt only with explicit new target safeguards and revalidation. The prior test cluster is stopped, and its data directory is retained. For a new baseline, arrange a **fresh** cluster at that same named task path while preserving the old data separately; do not delete the retained cluster or reuse a database with seed objects. PostgreSQL's localhost `trust` authentication permits other local processes on that port; use invented data only, run briefly, and stop it promptly. Verify the port is free before startup.

```powershell
$rt = Join-Path $env:TEMP 'peer-seed-pg-runtime'
$bin = Join-Path $rt 'pgsql\bin'
$data = Join-Path $rt 'data'
# Only on a NEW empty task data directory; initdb refuses an existing cluster.
& (Join-Path $bin 'initdb.exe') -D $data -U peer_test_admin -A trust --encoding=UTF8 --no-locale
# Check the exit status, then start only this cluster on loopback.
& (Join-Path $bin 'pg_ctl.exe') -D $data -l (Join-Path $rt 'postgres.log') -o '-h 127.0.0.1 -p 55479' -w start
& (Join-Path $bin 'psql.exe') -X -qAt -h 127.0.0.1 -p 55479 -U peer_test_admin -d postgres -c "select inet_server_addr(),inet_server_port(),current_setting('data_directory')"
# Confirm 127.0.0.1, 55479 and the task data directory BEFORE creating anything.
& (Join-Path $bin 'createdb.exe') -h 127.0.0.1 -p 55479 -U peer_test_admin peer_prodmeta_secure
```

For each command, stop on nonzero exit; never drop an existing database. The catalog exports are **metadata only**, not application/auth rows, and remain outside this folder. The previous exports were `%TEMP%/peer-rollout-evidence/production-schema-metadata.json` and `production-security-metadata.json`. Reconstruct and compare the local baseline using the selected source files, not copied production data. `prodmeta-baseline.sql` was generated from the first export by `generate-baseline.py`; it preserves exported dropped-column ordinal positions. `prodmeta-security-baseline.sql` sets exported owners, RLS flags, trigger and ACL; `auth-uid-exact.sql` sets the exported UID function definition. Before use, inspect these files and current metadata; `cluster-roles.sql` only creates missing roles on the guarded task cluster. In order, call `psql -X -h 127.0.0.1 -p 55479 -U peer_test_admin -d peer_prodmeta_secure -v ON_ERROR_STOP=1 -f <path>` for those four files. If the exact auth UID definition was re-exported, regenerate `auth-uid-exact.sql` and retain the target guard.

Capture `schema-metadata-local.sql` and `security-metadata-local.sql` output as JSON and compare with `compare-metadata.py --production-schema <file> --local-schema <file> --production-security <file> --local-security <file>`. Do not claim exact hosted equivalence: auth.users is synthetic, full Auth internals and production scale differ, local Postgres is 17.11 Windows x64 and production metadata reported 17.6 aarch64. Insert invented baseline rows using the guarded `prodmeta-legacy-data.sql` only after the metadata comparison.

Obtain root's read-only sequence metadata export separately. Match its postgres role attributes, owner, ACL, sequence properties and listed privileges in the isolated local setup. The wrapper compares those fields and refuses missing/mismatched metadata. The previous local sequence-owner mismatch caused a real test failure and is documented; do not infer production values from the prior simulation.

```powershell
# From this folder, with a fresh metadata-matched local DB and invented rows:
./invoke-local.ps1 -Action check
./invoke-local.ps1 -Action bundle -SequenceMetadata <read-only-sequence-export.json>
./invoke-local.ps1 -Action tests
& (Join-Path $bin 'pg_ctl.exe') -D $data -m fast -w stop
```

The wrapper checks target identity, sequence metadata, absence of seed state and exact bundle hash before replay. SQL assertions include owner/date isolation, legacy rows, cleanup and fences; the concurrency script uses distinct real connections and checks advisory-lock waiting. Metadata-matched **actual migration owner** matters: prior tests used local admin, then separately reassigned new functions/tables and the sequence to simulated `postgres` and reran the matrix. Until production sequence metadata and the exact-bundle replay are complete, do not claim this payload passed the final gate. Even after local pass, real Supabase Auth, storage, email and hosted UI remain separate acceptance checks. Legacy row conflict indicates a row exists, not proof an email was sent.
