-- 10-c15-verify.sql  (W12, rubric unit C15)  READ ONLY: SELECT statements only.
-- Run on peer-test (ref cbsbtkvbmvyznerbpmxg) three times and save each JSON cell:
--   c15-0-baseline.json      before any aging
--   c15-1-aged.json          after 10-c15-age-seed-fixture.sql and 10-c15-age-upload-meta.mjs --apply
--   c15-2-after-purge.json   after GET /api/jobs/purge-uploads
--
-- EDIT the two values in the params CTE:
--   owner_email    account A's sign-in email on peer-test
--   extra_hashes   hash16 values of A's ordinary uploads to report even after their
--                  owner marker is gone (copy them from the baseline output's
--                  "ordinary_uploads[].hash16" before you purge). Leave '{}' for the baseline run.
--
-- Prints no file contents, no email address, no token. Titles are of the
-- invented hosted fixtures only (fictional-canopy.pdf / fictional-battery.pdf).

WITH params AS (
  SELECT 'REPLACE_WITH_ACCOUNT_A_EMAIL'::text AS owner_email,
         '{}'::text[]                         AS extra_hashes
),
owner AS (
  SELECT u.id AS owner_id,
         encode(sha256(convert_to('account:' || u.id::text, 'UTF8')), 'hex') AS owner_key
    FROM auth.users u, params p
   WHERE lower(u.email) = lower(p.owner_email)
),
zone AS (
  SELECT o.owner_id, coalesce(nullif(pr.digest_timezone, ''), 'UTC') AS tz,
         (now() AT TIME ZONE coalesce(nullif(pr.digest_timezone, ''), 'UTC'))::date AS today
    FROM owner o LEFT JOIN public.profiles pr ON pr.user_id = o.owner_id
),
current_snapshot AS (
  SELECT s.* FROM public.seed_pool_snapshots s, zone z
   WHERE s.owner_id = z.owner_id AND NOT s.superseded AND s.effective_date <= z.today
   ORDER BY s.effective_date DESC, s.created_revision DESC LIMIT 1
),
objs AS (
  SELECT o.name, o.created_at
    FROM storage.objects o
   WHERE o.bucket_id = 'private-uploads'
),
hashes AS (
  SELECT DISTINCT h FROM (
    SELECT substr(ob.name, length('owners/' || ow.owner_key || '/') + 1) AS h
      FROM objs ob, owner ow
     WHERE ob.name LIKE 'owners/' || ow.owner_key || '/%'
    UNION ALL
    SELECT unnest(p.extra_hashes) FROM params p
  ) x WHERE h ~ '^[0-9a-f]{16}$'
)
SELECT jsonb_build_object(
  'checked_at', now(),
  'owner_found', (SELECT count(*) FROM owner) = 1,
  'owner_local_today', (SELECT today FROM zone),
  'owner_timezone', (SELECT tz FROM zone),
  'current_snapshot', (SELECT jsonb_build_object(
      'version', version, 'effective_date', effective_date,
      'seed_ids', (SELECT coalesce(jsonb_agg(e->>'id'), '[]'::jsonb) FROM jsonb_array_elements(seeds) e))
    FROM current_snapshot),
  'seed_assets', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id,
      'status', a.status,
      'created_at', a.created_at,
      'age_days', round((extract(epoch FROM now() - a.created_at) / 86400.0)::numeric, 2),
      'writer_settled', a.writer_settled,
      'cleanup_after', a.cleanup_after,
      'cleanup_complete', a.cleanup_complete,
      'title_present', a.title <> '',
      'canonical_key_kind', split_part(a.canonical_key, ':', 1),
      'content_hash_present', a.content_hash <> '',
      'features_md5', md5(a.features::text),
      'facet_counts', jsonb_build_object(
          'topic',  CASE WHEN jsonb_typeof(a.features->'topic')  = 'array' THEN jsonb_array_length(a.features->'topic')  END,
          'object', CASE WHEN jsonb_typeof(a.features->'object') = 'array' THEN jsonb_array_length(a.features->'object') END,
          'method', CASE WHEN jsonb_typeof(a.features->'method') = 'array' THEN jsonb_array_length(a.features->'method') END),
      'object_name_is_owner_namespace', a.object_name = 'seed-pool/' || ow.owner_key || '/' || a.id::text || '.pdf',
      'storage_object_present', EXISTS (SELECT 1 FROM objs ob WHERE ob.name = a.object_name),
      'in_current_snapshot', EXISTS (SELECT 1 FROM current_snapshot cs, jsonb_array_elements(cs.seeds) e WHERE e->>'id' = a.id::text),
      'in_any_live_snapshot', EXISTS (SELECT 1 FROM public.seed_pool_snapshots s, jsonb_array_elements(s.seeds) e
                                       WHERE s.owner_id = a.owner_id AND NOT s.superseded AND e->>'id' = a.id::text)
    ) ORDER BY a.created_at), '[]'::jsonb)
    FROM public.seed_pool_assets a, owner ow WHERE a.owner_id = ow.owner_id),
  'ordinary_uploads', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'hash16', h.h,
      'meta_json_present',   EXISTS (SELECT 1 FROM objs ob WHERE ob.name = h.h || '.json'),
      'pdf_present',         EXISTS (SELECT 1 FROM objs ob WHERE ob.name = h.h || '.pdf'),
      'doc_sidecar_present', EXISTS (SELECT 1 FROM objs ob WHERE ob.name = h.h || '.doc.json'),
      'owner_marker_present', EXISTS (SELECT 1 FROM objs ob, owner ow WHERE ob.name = 'owners/' || ow.owner_key || '/' || h.h),
      'meta_json_storage_created_at', (SELECT ob.created_at FROM objs ob WHERE ob.name = h.h || '.json')
    ) ORDER BY h.h), '[]'::jsonb)
    FROM hashes h),
  'seed_namespace_object_count', (SELECT count(*) FROM objs ob, owner ow WHERE ob.name LIKE 'seed-pool/' || ow.owner_key || '/%'),
  'incoming_object_count', (SELECT count(*) FROM objs ob, owner ow WHERE ob.name LIKE 'incoming/' || ow.owner_key || '/%')
) AS peer_test_c15_verify;
