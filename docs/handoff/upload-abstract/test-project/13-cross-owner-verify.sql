-- 13-cross-owner-verify.sql  (W12, rubric units B7 / C17)  READ ONLY: SELECT statements only.
-- Run before and after account B's probes (13-cross-owner-probes.md) and save
-- both cells. Every "a_*" value must be identical before and after; every
-- "b_*_referencing_a" count must be 0.
--
-- EDIT the params CTE with values copied from A's side (all non-secret ids):
--   a_email, b_email   the two sign-in emails on peer-test
--   a_hash16           A's ordinary upload (upload:<hash16>)
--   a_seed_id          A's seed asset id
--   a_batch_id         A's dashboard batch id (meta.batchId), or the zero uuid if none

WITH params AS (
  SELECT 'REPLACE_WITH_ACCOUNT_A_EMAIL'::text                  AS a_email,
         'REPLACE_WITH_ACCOUNT_B_EMAIL'::text                  AS b_email,
         '0000000000000000'::text                              AS a_hash16,
         '00000000-0000-0000-0000-000000000000'::uuid          AS a_seed_id,
         '00000000-0000-0000-0000-000000000000'::uuid          AS a_batch_id
),
a AS (
  SELECT u.id, encode(sha256(convert_to('account:' || u.id::text, 'UTF8')), 'hex') AS owner_key
    FROM auth.users u, params p WHERE lower(u.email) = lower(p.a_email)
),
b AS (
  SELECT u.id, encode(sha256(convert_to('account:' || u.id::text, 'UTF8')), 'hex') AS owner_key
    FROM auth.users u, params p WHERE lower(u.email) = lower(p.b_email)
),
objs AS (
  SELECT name FROM storage.objects WHERE bucket_id = 'private-uploads'
)
SELECT jsonb_build_object(
  'checked_at', now(),
  'a_found', (SELECT count(*) FROM a) = 1,
  'b_found', (SELECT count(*) FROM b) = 1,
  'b_profile_present', EXISTS (SELECT 1 FROM public.profiles pr, b WHERE pr.user_id = b.id),
  -- Pseudonymous storage folder key of A (sha256 of "account:<A id>"), needed by probes U12/S3.
  'a_owner_key', (SELECT owner_key FROM a),

  'a_upload_objects', (SELECT jsonb_build_object(
      'meta_json', EXISTS (SELECT 1 FROM objs WHERE name = p.a_hash16 || '.json'),
      'pdf', EXISTS (SELECT 1 FROM objs WHERE name = p.a_hash16 || '.pdf'),
      'owner_marker', EXISTS (SELECT 1 FROM objs, a WHERE name = 'owners/' || a.owner_key || '/' || p.a_hash16))
    FROM params p),
  'a_seed_asset', (SELECT jsonb_build_object('status', s.status, 'features_md5', md5(s.features::text),
                     'title_present', s.title <> '',
                     'object_present', EXISTS (SELECT 1 FROM objs WHERE name = s.object_name))
                     FROM public.seed_pool_assets s, a, params p WHERE s.owner_id = a.id AND s.id = p.a_seed_id),
  'a_seed_state', (SELECT jsonb_build_object('revision', revision, 'revocation_generation', revocation_generation)
                     FROM public.seed_pool_state s, a WHERE s.owner_id = a.id),
  'a_batch', (SELECT jsonb_build_object('status', bt.status, 'acknowledged_at', bt.acknowledged_at)
                FROM public.dashboard_batches bt, a, params p WHERE bt.owner_id = a.id AND bt.id = p.a_batch_id),

  'b_seed_state', (SELECT jsonb_build_object('revision', revision, 'revocation_generation', revocation_generation)
                     FROM public.seed_pool_state s, b WHERE s.owner_id = b.id),
  'b_snapshots_referencing_a_seed', (SELECT count(*) FROM public.seed_pool_snapshots s, b, params p
                                      WHERE s.owner_id = b.id
                                        AND EXISTS (SELECT 1 FROM jsonb_array_elements(s.seeds) e WHERE e->>'id' = p.a_seed_id::text)),
  'b_assets_with_a_seed_id', (SELECT count(*) FROM public.seed_pool_assets s, b, params p WHERE s.owner_id = b.id AND s.id = p.a_seed_id),
  'b_markers_referencing_a_upload', (SELECT count(*) FROM objs, b, params p WHERE name = 'owners/' || b.owner_key || '/' || p.a_hash16),
  'b_batches_with_a_batch_id', (SELECT count(*) FROM public.dashboard_batches bt, b, params p WHERE bt.owner_id = b.id AND bt.id = p.a_batch_id),
  'b_deliveries_naming_a_batch', (SELECT count(*) FROM public.dashboard_deliveries d, b, params p WHERE d.owner_id = b.id AND d.batch_id = p.a_batch_id),
  'same_bytes_seed_copies', (SELECT jsonb_build_object(
      'a_live', (SELECT count(*) FROM public.seed_pool_assets s, a WHERE s.owner_id = a.id AND s.status <> 'revoked'
                   AND s.content_hash IN (SELECT content_hash FROM public.seed_pool_assets x, b WHERE x.owner_id = b.id AND x.content_hash <> '')),
      'b_any',  (SELECT count(*) FROM public.seed_pool_assets s, b WHERE s.owner_id = b.id
                   AND s.content_hash IN (SELECT content_hash FROM public.seed_pool_assets x, a WHERE x.owner_id = a.id AND x.content_hash <> ''))))
) AS peer_test_cross_owner_verify;
