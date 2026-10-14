-- Public Moroccan retailer sites discovered during coverage review. These are
-- only leads: product-page inspection is still required before validation.
INSERT INTO public.retailers (
  name, domain, canonical_domain, country_code, validation_status, seller_type,
  categories, languages, discovery_source, is_supported
)
SELECT seed.name, seed.domain, seed.domain, 'MA', 'discovered', seed.seller_type,
       seed.categories, ARRAY['fr', 'ar'], 'coverage_review', false
FROM (VALUES
  ('Electroplanet Morocco', 'electroplanet.ma', 'independent', ARRAY['electronics', 'appliances', 'general']::TEXT[]),
  ('Micromagma Morocco', 'micromagma.ma', 'independent', ARRAY['electronics', 'computers', 'general']::TEXT[]),
  ('eSouq Morocco', 'esouq.ma', 'marketplace', ARRAY['home', 'appliances', 'general']::TEXT[])
) AS seed(name, domain, seller_type, categories)
WHERE NOT EXISTS (
  SELECT 1 FROM public.retailers existing
  WHERE lower(existing.canonical_domain) = lower(seed.domain)
    AND existing.country_code = 'MA'
);
