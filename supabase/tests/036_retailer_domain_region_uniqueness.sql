BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(3);

CREATE TEMP TABLE retailer_domain_test_values (domain TEXT NOT NULL);
INSERT INTO retailer_domain_test_values VALUES ('domain-unique-' || gen_random_uuid()::TEXT || '.example');

INSERT INTO public.retailers (name, domain, canonical_domain, country_code, validation_status, seller_type)
SELECT 'Retailer uniqueness global test', domain, domain, 'GLOBAL', 'discovered', 'unknown'
FROM retailer_domain_test_values;
INSERT INTO public.retailers (name, domain, canonical_domain, country_code, validation_status, seller_type)
SELECT 'Retailer uniqueness regional test', domain, domain, 'MA', 'discovered', 'unknown'
FROM retailer_domain_test_values;

SELECT extensions.is(
  (SELECT count(*)::INTEGER FROM public.retailers r JOIN retailer_domain_test_values v ON r.canonical_domain = v.domain),
  2,
  'the same canonical domain can represent separate country storefronts'
);

SELECT extensions.throws_ok(
  $$INSERT INTO public.retailers (name, domain, canonical_domain, country_code, validation_status, seller_type)
    SELECT 'Retailer duplicate regional test', domain, domain, 'MA', 'discovered', 'unknown'
    FROM retailer_domain_test_values$$,
  '23505',
  'duplicate key value violates unique constraint "idx_retailers_domain_region_unique"',
  'a canonical domain cannot be duplicated within the same country'
);

SELECT extensions.ok(
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'retailers'
      AND indexname = 'idx_retailers_domain_region_unique'
  ),
  'retailer regional uniqueness is enforced by a database index'
);

SELECT * FROM extensions.finish();
ROLLBACK;
