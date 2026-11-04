# C checkpoint — W15 launcher production mode (2026-11-04)

Brief: `docs/handoff/upload-abstract/briefs/W15-LAUNCHER-PROD.md`. Base HEAD `0a156602`, detached worktree `C:/Users/wbc13/AppData/Local/Temp/peer-wt-w15`.

## What changed

- `web/scripts/dev-test-target.mjs` — new `--prod` flag. Env loading, git-ignore check, required names, test-ref / production-ref / JWT-ref / key-kind refusals, forced, defaulted and blanked variables, and the names-only printing are shared unchanged with dev mode. With `--prod`: orphan cleanup (`kill-dev-orphans.mjs`), then `node <next> build` (cwd `web/`), and only if it exits 0, `node <next> start -p 3000`; both spawned without a shell with the same overridden env. A NODE_ENV inherited from the shell is removed in `--prod` so Next sets `production` itself. SIGINT/SIGTERM are forwarded to the running step; a stop during the build never starts the server; a failed build prints `next build exited <code>; not starting the server.` and exits with that code. `--dry-run` prints `mode: …` and the planned command(s) for both modes and starts nothing.
- `.claude/launch.json` — second config `peer-web-test-target-prod` (cwd `web`, `node scripts/dev-test-target.mjs --prod`, port 3000, autoPort false). Existing configs untouched.
- `web/src/scripts/dev-test-target.test.ts` — new; spawns the script with `--dry-run` and FAKE env files in an OS temp dir (5 cases: prod plan build→start with "if it exits 0" in between and no dev; dev plan unchanged; sentinel values never printed; `--prod` refuses a production-ref mention in any variable; `--prod` refuses a non-peer-test URL host).

## Operator notes (for the manager)

- NEXT_PUBLIC_* values are inlined at build time, and the build overwrites `web/.next`'s production output (Next 16 dev writes `.next/dev`, so a dev server's output is untouched). After a `--prod` run, a plain `npm run start` would serve the test-target client bundle — run `npm run build` again before using `next start` for anything else.
- `npm run build`'s `prebuild` guard is not run; it only acts on Vercel builds (`VERCEL`/`VERCEL_ENV`).
- No `web/.env.production*` files exist (checked by name only), so production mode loads nothing extra beyond what dev mode already did; process.env still wins for every listed name.
- A real build/start was NOT run here (brief: port 3000 forbidden for workers; real env files never loaded). The Turbopack build is expected to run from the main checkout with its real node_modules.

## Gates

| Gate | Result |
|---|---|
| `node --check scripts/dev-test-target.mjs` | ok |
| eslint on the script + new test | clean |
| `src/scripts/dev-test-target.test.ts` | 5/5 |
| `src/lib/security/spend-scans.test.ts` + `src/scripts/assert-byok-production-env.test.ts` (with the new test) | 3 files, 129/129 |
| Mutation: `if (!args.prod && …includes(PRODUCTION_REF))` | 1 red ("--prod refuses … production ref"), 4 green; restored byte-identical, sha256 `e494d99ad460524b88880bdd6694be52e447b7935e6010ccbc93d0675661aa8f` before = after; 5/5 green again |
