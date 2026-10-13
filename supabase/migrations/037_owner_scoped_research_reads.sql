-- Price history and retailer offers belong to a wishlist item. Apply the same
-- visibility rules as items so private wishlists do not leak prices or URLs.
DROP POLICY IF EXISTS price_points_read ON public.price_points;
DROP POLICY IF EXISTS "price read" ON public.price_points;
CREATE POLICY price_points_read ON public.price_points
  FOR SELECT USING (item_id IN (SELECT id FROM public.items));

DROP POLICY IF EXISTS store_offers_read ON public.store_offers;
DROP POLICY IF EXISTS "offers read" ON public.store_offers;
CREATE POLICY store_offers_read ON public.store_offers
  FOR SELECT USING (item_id IN (SELECT id FROM public.items));
