-- Keep one retailer record per canonical domain and country while allowing
-- genuinely distinct regional storefront records for the same global domain.
BEGIN;

CREATE TEMP TABLE retailer_domain_merges ON COMMIT DROP AS
WITH ranked AS (
  SELECT id,
         first_value(id) OVER region AS keeper_id,
         row_number() OVER region AS position
  FROM public.retailers
  WHERE canonical_domain IS NOT NULL
    AND btrim(canonical_domain) <> ''
    AND country_code IS NOT NULL
  WINDOW region AS (
    PARTITION BY lower(canonical_domain), country_code
    ORDER BY (validation_status = 'validated') DESC,
             (seller_type <> 'unknown') DESC,
             is_supported DESC,
             reliability_score DESC,
             last_successful_at DESC NULLS LAST,
             first_discovered_at ASC,
             name ASC,
             id ASC
  )
)
SELECT id AS duplicate_id, keeper_id
FROM ranked
WHERE position > 1;

UPDATE public.retailer_discovery_events AS event
SET retailer_id = merge.keeper_id
FROM retailer_domain_merges AS merge
WHERE event.retailer_id = merge.duplicate_id;

UPDATE public.retailers AS keeper
SET categories = ARRAY(
      SELECT DISTINCT category
      FROM (
        SELECT unnest(COALESCE(keeper.categories, '{}'::TEXT[])) AS category
        UNION ALL
        SELECT unnest(COALESCE(duplicate.categories, '{}'::TEXT[])) AS category
        FROM retailer_domain_merges AS merge
        JOIN public.retailers AS duplicate ON duplicate.id = merge.duplicate_id
        WHERE merge.keeper_id = keeper.id
      ) AS all_categories
      WHERE category IS NOT NULL
      ORDER BY category
    ),
    languages = ARRAY(
      SELECT DISTINCT language
      FROM (
        SELECT unnest(COALESCE(keeper.languages, '{}'::TEXT[])) AS language
        UNION ALL
        SELECT unnest(COALESCE(duplicate.languages, '{}'::TEXT[])) AS language
        FROM retailer_domain_merges AS merge
        JOIN public.retailers AS duplicate ON duplicate.id = merge.duplicate_id
        WHERE merge.keeper_id = keeper.id
      ) AS all_languages
      WHERE language IS NOT NULL
      ORDER BY language
    ),
    shipping_countries = ARRAY(
      SELECT DISTINCT country
      FROM (
        SELECT unnest(COALESCE(keeper.shipping_countries, '{}'::TEXT[])) AS country
        UNION ALL
        SELECT unnest(COALESCE(duplicate.shipping_countries, '{}'::TEXT[])) AS country
        FROM retailer_domain_merges AS merge
        JOIN public.retailers AS duplicate ON duplicate.id = merge.duplicate_id
        WHERE merge.keeper_id = keeper.id
      ) AS all_countries
      WHERE country IS NOT NULL
      ORDER BY country
    ),
    seller_type = COALESCE(
      NULLIF(keeper.seller_type, 'unknown'),
      (
        SELECT NULLIF(duplicate.seller_type, 'unknown')
        FROM retailer_domain_merges AS merge
        JOIN public.retailers AS duplicate ON duplicate.id = merge.duplicate_id
        WHERE merge.keeper_id = keeper.id
        ORDER BY (duplicate.validation_status = 'validated') DESC,
                 duplicate.reliability_score DESC,
                 duplicate.name ASC
        LIMIT 1
      ),
      keeper.seller_type
    ),
    is_supported = keeper.is_supported OR EXISTS (
      SELECT 1 FROM retailer_domain_merges AS merge
      JOIN public.retailers AS duplicate ON duplicate.id = merge.duplicate_id
      WHERE merge.keeper_id = keeper.id AND duplicate.is_supported
    ),
    first_discovered_at = LEAST(
      keeper.first_discovered_at,
      COALESCE((
        SELECT MIN(duplicate.first_discovered_at)
        FROM retailer_domain_merges AS merge
        JOIN public.retailers AS duplicate ON duplicate.id = merge.duplicate_id
        WHERE merge.keeper_id = keeper.id
      ), keeper.first_discovered_at)
    ),
    last_inspected_at = GREATEST(
      keeper.last_inspected_at,
      (SELECT MAX(duplicate.last_inspected_at)
       FROM retailer_domain_merges AS merge
       JOIN public.retailers AS duplicate ON duplicate.id = merge.duplicate_id
       WHERE merge.keeper_id = keeper.id)
    ),
    last_successful_at = GREATEST(
      keeper.last_successful_at,
      (SELECT MAX(duplicate.last_successful_at)
       FROM retailer_domain_merges AS merge
       JOIN public.retailers AS duplicate ON duplicate.id = merge.duplicate_id
       WHERE merge.keeper_id = keeper.id)
    ),
    reliability_score = GREATEST(
      keeper.reliability_score,
      COALESCE((SELECT MAX(duplicate.reliability_score)
       FROM retailer_domain_merges AS merge
       JOIN public.retailers AS duplicate ON duplicate.id = merge.duplicate_id
       WHERE merge.keeper_id = keeper.id), keeper.reliability_score)
    ),
    trust_evidence = COALESCE(
      keeper.trust_evidence,
      (SELECT duplicate.trust_evidence
       FROM retailer_domain_merges AS merge
       JOIN public.retailers AS duplicate ON duplicate.id = merge.duplicate_id
       WHERE merge.keeper_id = keeper.id AND duplicate.trust_evidence IS NOT NULL
       LIMIT 1)
    )
WHERE keeper.id IN (SELECT keeper_id FROM retailer_domain_merges);

DELETE FROM public.retailers AS duplicate
USING retailer_domain_merges AS merge
WHERE duplicate.id = merge.duplicate_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_retailers_domain_region_unique
  ON public.retailers (lower(canonical_domain), country_code)
  WHERE canonical_domain IS NOT NULL
    AND btrim(canonical_domain) <> ''
    AND country_code IS NOT NULL;

COMMIT;
