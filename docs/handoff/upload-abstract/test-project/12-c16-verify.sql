-- 12-c16-verify.sql  (W12, rubric unit C16)  READ ONLY: SELECT statements only.
-- Before/after record of an in-app "Forget this PDF and its recommendations" on
-- peer-test (ref cbsbtkvbmvyznerbpmxg). Run (a) just before clicking Confirm
-- forget and (b) just after, BEFORE opening the Today page again (a feed visit
-- legitimately rebuilds cache rows under the new generation).
--
-- EDIT the params CTE:
--   owner_email   account A
--   seed_id       the asset id being forgotten (from the "before" run's seed_assets, or Network tab)
--   versions      '{}' for the "before" run; for the "after" run paste the
--                 before run's "snapshot_versions_containing_seed" values, e.g.
--                 '{3f0c...,9a1b...}'::text[] (forget scrubs the seed from the
--                 snapshots, so it can no longer be looked up afterwards)
-- Prints ids, flags and counts only.

WITH params AS (
  SELECT 'REPLACE_WITH_ACCOUNT_A_EMAIL'::text          AS owner_email,
         '00000000-0000-0000-0000-000000000000'::uuid  AS seed_id,
         '{}'::text[]                                  AS versions
),
owner AS (
  SELECT u.id AS owner_id,
         encode(sha256(convert_to('account:' || u.id::text, 'UTF8')), 'hex') AS owner_key
    FROM auth.users u, params p WHERE lower(u.email) = lower(p.owner_email)
),
asset AS (
  SELECT a.* FROM public.seed_pool_assets a, owner o, params p
   WHERE a.owner_id = o.owner_id AND a.id = p.seed_id
),
containing AS (
  SELECT s.version::text AS version, s.effective_date, s.superseded
    FROM public.seed_pool_snapshots s, owner o, params p
   WHERE s.owner_id = o.owner_id
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(s.seeds) e WHERE e->>'id' = p.seed_id::text)
),
vers AS (
  SELECT DISTINCT v FROM (
    SELECT version AS v FROM containing
    UNION ALL SELECT unnest(p.versions) FROM params p
  ) x WHERE v IS NOT NULL
)
SELECT jsonb_build_object(
  'checked_at', now(),
  'owner_found', (SELECT count(*) FROM owner) = 1,
  'seed_state', (SELECT jsonb_build_object('revision', s.revision, 'revocation_generation', s.revocation_generation,
                   'pending_version', s.pending_version::text, 'pending_effective', s.pending_effective)
                   FROM public.seed_pool_state s, owner o WHERE s.owner_id = o.owner_id),
  'asset', (SELECT jsonb_build_object(
      'status', a.status,
      'title_present', a.title <> '',
      'canonical_key_kind', split_part(a.canonical_key, ':', 1),
      'content_hash_present', a.content_hash <> '',
      'upload_id_present', a.upload_id <> '',
      'features_empty', a.features = '{}'::jsonb,
      'public_ids_empty', a.public_ids = '{}'::jsonb,
      'features_md5', md5(a.features::text),
      'cleanup_after', a.cleanup_after,
      'cleanup_complete', a.cleanup_complete,
      'writer_settled', a.writer_settled,
      'object_name_is_owner_namespace', a.object_name = 'seed-pool/' || o.owner_key || '/' || a.id::text || '.pdf',
      'storage_object_present', EXISTS (SELECT 1 FROM storage.objects ob
                                         WHERE ob.bucket_id = 'private-uploads' AND ob.name = a.object_name))
    FROM asset a, owner o),
  'related_live_assets', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'status', r.status)), '[]'::jsonb)
                            FROM public.seed_pool_assets r, asset a
                           WHERE r.owner_id = a.owner_id AND r.id <> a.id AND r.status <> 'revoked'
                             AND (r.canonical_key = a.canonical_key OR (a.content_hash <> '' AND r.content_hash = a.content_hash))),
  'snapshot_versions_containing_seed', (SELECT coalesce(jsonb_agg(version ORDER BY effective_date), '[]'::jsonb) FROM containing),
  'snapshots_containing_seed', (SELECT count(*) FROM containing),
  'editor_lists_as_available', EXISTS (SELECT 1 FROM asset WHERE status = 'ready'),
  'editor_lists_as_cleanup_pending', EXISTS (SELECT 1 FROM asset WHERE status = 'revoked' AND NOT cleanup_complete),
  'versions_checked', (SELECT coalesce(jsonb_agg(v), '[]'::jsonb) FROM vers),
  'batches_with_those_versions', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'local_date', b.local_date, 'status', b.status)), '[]'::jsonb)
                                    FROM public.dashboard_batches b, owner o
                                   WHERE b.owner_id = o.owner_id AND b.seed_pool_version IN (SELECT v FROM vers)),
  'deliveries_with_those_versions', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                        'id', d.id, 'local_date', d.local_date,
                                        'payload_empty', d.payload = '{}'::jsonb,
                                        'item_ids_count', cardinality(d.item_ids))), '[]'::jsonb)
                                       FROM public.briefing_deliveries d, owner o
                                      WHERE d.user_id = o.owner_id AND d.seed_pool_version IN (SELECT v FROM vers)),
  'owner_counts', (SELECT jsonb_build_object(
      'private_paper_pools', (SELECT count(*) FROM public.private_paper_pools x WHERE x.owner_id = o.owner_id),
      'dashboard_rollover_candidates', (SELECT count(*) FROM public.dashboard_rollover_candidates x WHERE x.owner_id = o.owner_id),
      'dashboard_batches', (SELECT count(*) FROM public.dashboard_batches x WHERE x.owner_id = o.owner_id),
      'dashboard_deliveries', (SELECT count(*) FROM public.dashboard_deliveries x WHERE x.owner_id = o.owner_id),
      'briefing_deliveries', (SELECT count(*) FROM public.briefing_deliveries x WHERE x.user_id = o.owner_id),
      'reading_upload_markers', (SELECT count(*) FROM storage.objects ob
                                  WHERE ob.bucket_id = 'private-uploads' AND ob.name LIKE 'owners/' || o.owner_key || '/%'),
      'seed_namespace_objects', (SELECT count(*) FROM storage.objects ob
                                  WHERE ob.bucket_id = 'private-uploads' AND ob.name LIKE 'seed-pool/' || o.owner_key || '/%'))
    FROM owner o)
) AS peer_test_c16_verify;
