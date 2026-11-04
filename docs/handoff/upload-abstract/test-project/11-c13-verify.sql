-- 11-c13-verify.sql  (W12, rubric unit C13)  READ ONLY: SELECT statements only.
-- One JSON cell comparing, for ONE owner and ONE owner-local date, the persisted
-- seed version / revocation generation / item list across:
--   seed_pool_snapshots + seed_pool_state   (the pool in force)
--   dashboard_batches                       (the frozen batch the web feed serves)
--   briefing_deliveries (+ payload.email)   (the digest claim and its rendered email)
--   private_paper_pools                     (the personalized pool cache)
-- Run it (a) before the dispatch run as a preflight and (b) after it.
-- Prints ids, versions, counts and booleans only: no email address, no email
-- body, no token.
--
-- EDIT the params CTE: owner_email = account A; local_date = '' for A's
-- owner-local today, or 'YYYY-MM-DD' to inspect another day.

WITH params AS (
  SELECT 'REPLACE_WITH_ACCOUNT_A_EMAIL'::text AS owner_email,
         ''::text                             AS local_date
),
owner AS (
  SELECT u.id AS owner_id FROM auth.users u, params p WHERE lower(u.email) = lower(p.owner_email)
),
prof AS (
  SELECT pr.* FROM public.profiles pr, owner o WHERE pr.user_id = o.owner_id
),
tzrow AS (
  SELECT coalesce(nullif((SELECT digest_timezone FROM prof), ''), 'UTC') AS tz
),
tday AS (
  SELECT coalesce(nullif(p.local_date, ''), ((now() AT TIME ZONE z.tz)::date)::text) AS local_date,
         ((now() AT TIME ZONE z.tz)::date)::text AS owner_today
    FROM params p, tzrow z
),
snap AS (
  SELECT s.* FROM public.seed_pool_snapshots s, owner o, tday d
   WHERE s.owner_id = o.owner_id AND NOT s.superseded AND s.effective_date <= d.local_date::date
   ORDER BY s.effective_date DESC, s.created_revision DESC LIMIT 1
),
st AS (
  SELECT s.* FROM public.seed_pool_state s, owner o WHERE s.owner_id = o.owner_id
),
b AS (
  SELECT bt.* FROM public.dashboard_batches bt, owner o, tday d
   WHERE bt.owner_id = o.owner_id AND bt.local_date = d.local_date
),
dl AS (
  SELECT bd.* FROM public.briefing_deliveries bd, owner o, tday d
   WHERE bd.user_id = o.owner_id AND bd.local_date = d.local_date
),
b_items AS (
  SELECT x.e->>'id' AS id, x.e->>'title' AS title, x.ord
    FROM b, jsonb_array_elements(coalesce(b.served_items, '[]'::jsonb)) WITH ORDINALITY AS x(e, ord)
),
dl_payload_items AS (
  SELECT x.e->>'id' AS id, x.ord
    FROM dl, jsonb_array_elements(CASE WHEN jsonb_typeof(dl.payload->'items') = 'array'
                                       THEN dl.payload->'items' ELSE '[]'::jsonb END) WITH ORDINALITY AS x(e, ord)
),
email AS (
  SELECT dl.payload->'email' AS em FROM dl
),
pos AS (
  SELECT bi.ord,
         position((bi.ord::text || '. ' || bi.title) IN coalesce((SELECT em->>'text' FROM email), '')) AS p
    FROM b_items bi
),
pools AS (
  SELECT pp.* FROM public.private_paper_pools pp, owner o, tday d
   WHERE pp.owner_id = o.owner_id AND pp.scope_key LIKE 'peer-pool-v%-papers-' || d.local_date || '-%'
),
pool_ids AS (
  SELECT DISTINCT x.e->>'id' AS id
    FROM pools, jsonb_array_elements(CASE WHEN jsonb_typeof(pools.payload->'items') = 'array'
                                          THEN pools.payload->'items' ELSE '[]'::jsonb END) AS x(e)
),
rollover_ids AS (
  SELECT DISTINCT r.payload->>'id' AS id
    FROM public.dashboard_rollover_candidates r, owner o WHERE r.owner_id = o.owner_id
)
SELECT jsonb_build_object(
  'checked_at', now(),
  'owner_found', (SELECT count(*) FROM owner) = 1,
  'local_date', (SELECT local_date FROM tday),
  'owner_today', (SELECT owner_today FROM tday),
  'owner_timezone', (SELECT tz FROM tzrow),

  'preflight', jsonb_build_object(
    'profile', (SELECT jsonb_build_object(
                  'digest_enabled', digest_enabled, 'digest_frequency', digest_frequency,
                  'digest_hour_local', digest_hour_local, 'digest_channel', digest_channel,
                  'digest_email_set', digest_email IS NOT NULL,
                  'research_topics_count', coalesce(cardinality(research_topics), 0),
                  'feed_intent_present', feed_intent IS NOT NULL) FROM prof),
    'other_profiles_digest_enabled', (SELECT count(*) FROM public.profiles pr, owner o
                                       WHERE pr.digest_enabled AND pr.user_id <> o.owner_id),
    'deliveries_in_last_6h', (SELECT count(*) FROM public.briefing_deliveries bd, owner o
                               WHERE bd.user_id = o.owner_id AND bd.delivered_at >= now() - interval '6 hours')
  ),

  'pool_in_force', (SELECT jsonb_build_object('version', version::text, 'effective_date', effective_date,
                      'seed_count', jsonb_array_length(seeds)) FROM snap),
  'seed_state', (SELECT jsonb_build_object('revision', revision, 'revocation_generation', revocation_generation,
                   'pending_version', pending_version::text, 'pending_effective', pending_effective) FROM st),

  'batch', (SELECT jsonb_build_object(
              'id', id, 'status', status, 'seed_pool_version', seed_pool_version,
              'seed_revocation_generation', seed_revocation_generation, 'created_at', created_at,
              'served_at', served_at, 'acknowledged_at', acknowledged_at,
              'served_items_count', CASE WHEN jsonb_typeof(served_items) = 'array' THEN jsonb_array_length(served_items) END,
              'item_ids', (SELECT coalesce(jsonb_agg(bi.id ORDER BY bi.ord), '[]'::jsonb) FROM b_items bi)) FROM b),

  'delivery', (SELECT jsonb_build_object(
                 'id', id, 'channel', channel, 'delivered_at', delivered_at,
                 'seed_pool_version', seed_pool_version, 'seed_revocation_generation', seed_revocation_generation,
                 'item_ids', to_jsonb(item_ids),
                 'email', CASE WHEN payload ? 'email' THEN jsonb_build_object(
                     'sent', coalesce((payload->'email'->>'sent')::boolean, false),
                     'attempted_at', payload->'email'->>'attemptedAt',
                     'sent_at', payload->'email'->>'sentAt',
                     'to_present', coalesce(payload->'email'->>'to', '') <> '',
                     'subject_present', coalesce(payload->'email'->>'subject', '') <> '',
                     'html_bytes', octet_length(coalesce(payload->'email'->>'html', '')),
                     'text_bytes', octet_length(coalesce(payload->'email'->>'text', '')),
                     'idempotency_key_present', coalesce(payload->'email'->>'idempotencyKey', '') <> '')
                   ELSE NULL END) FROM dl),

  'personalized_cache', jsonb_build_object(
    'rows_for_date', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'scope_key_head', split_part(scope_key, '-papers-', 1) || '-papers-' || (SELECT local_date FROM tday),
        'payload_local_date', payload->>'localDate',
        'surface', payload->>'surface',
        'item_count', CASE WHEN jsonb_typeof(payload->'items') = 'array' THEN jsonb_array_length(payload->'items') END,
        'created_at', created_at) ORDER BY created_at), '[]'::jsonb) FROM pools),
    'served_ids_missing_from_pool_and_rollover', (SELECT count(*) FROM b_items bi
        WHERE NOT EXISTS (SELECT 1 FROM pool_ids pi WHERE pi.id = bi.id)
          AND NOT EXISTS (SELECT 1 FROM rollover_ids ri WHERE ri.id = bi.id))
  ),

  'observed_day_marker', EXISTS (SELECT 1 FROM public.seed_pool_observed_days od, owner o, tday d
                                  WHERE od.owner_id = o.owner_id AND od.local_date = d.local_date::date),

  'checks', jsonb_build_object(
    'batch_exists', EXISTS (SELECT 1 FROM b),
    'delivery_exists', EXISTS (SELECT 1 FROM dl),
    'batch_version_eq_pool_in_force',
        (SELECT seed_pool_version FROM b) IS NOT DISTINCT FROM (SELECT version::text FROM snap),
    'delivery_version_eq_batch',
        (SELECT seed_pool_version FROM dl) IS NOT DISTINCT FROM (SELECT seed_pool_version FROM b),
    'generation_batch_eq_state',
        (SELECT seed_revocation_generation FROM b) IS NOT DISTINCT FROM (SELECT revocation_generation FROM st),
    'generation_delivery_eq_batch',
        (SELECT seed_revocation_generation FROM dl) IS NOT DISTINCT FROM (SELECT seed_revocation_generation FROM b),
    'delivery_item_ids_eq_batch_in_order',
        (SELECT item_ids FROM dl) IS NOT DISTINCT FROM (SELECT coalesce(array_agg(id ORDER BY ord), '{}'::text[]) FROM b_items),
    'delivery_payload_items_eq_batch_in_order',
        (SELECT coalesce(array_agg(id ORDER BY ord), '{}'::text[]) FROM dl_payload_items)
          IS NOT DISTINCT FROM (SELECT coalesce(array_agg(id ORDER BY ord), '{}'::text[]) FROM b_items),
    'email_text_names_every_batch_item',
        CASE WHEN (SELECT em FROM email) IS NULL THEN NULL
             ELSE (SELECT coalesce(bool_and(p > 0), true) FROM pos) END,
    'email_text_item_order_eq_batch',
        CASE WHEN (SELECT em FROM email) IS NULL THEN NULL
             ELSE (SELECT coalesce(bool_and(p > prev), true)
                     FROM (SELECT p, lag(p) OVER (ORDER BY ord) AS prev FROM pos) q
                    WHERE prev IS NOT NULL) END,
    'email_text_item_count_line',
        CASE WHEN (SELECT em FROM email) IS NULL THEN NULL
             ELSE position(('Here are ' || (SELECT count(*) FROM b_items)::text || ' items')
                           IN coalesce((SELECT em->>'text' FROM email), '')) > 0 END
  )
) AS peer_test_c13_verify;
