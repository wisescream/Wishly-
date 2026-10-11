import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Compass, ExternalLink, Heart, Search, Sparkles } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Header } from '@/components/layout/Header';
import { SearchBar } from '@/components/shared/SearchBar';
import { ListCard } from '@/components/shared/ListCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { getMyWishlistItems, getPublicWishlists, getStyleProfile } from '@/lib/api';
import { searchGlobalProducts } from '@/lib/providers';
import { buildPersonalizedSearches, rankPersonalizedCandidates } from '@/lib/personalizedDiscovery';
import { formatPrice, type Currency } from '@/lib/currency';
import type { ProductCandidate } from '@/types/database';

export default function Discover() {
  const [search, setSearch] = useState('');
  const { profile: authProfile } = useAuth();
  const { data: publicLists = [], isLoading } = useQuery({
    queryKey: ['public-wishlists'],
    queryFn: () => getPublicWishlists(24),
  });
  const { data: personalFeed, isLoading: isLoadingPersonal, isFetching: isRefreshingPersonal, error: personalError, refetch: refreshPersonal } = useQuery({
    queryKey: ['discover-personalized', authProfile?.id],
    enabled: Boolean(authProfile?.id),
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const userId = authProfile?.id;
      if (!userId) return { items: [], searches: [], suggestions: [] };
      const [items, styleProfile] = await Promise.all([getMyWishlistItems(userId), getStyleProfile(userId)]);
      const searches = buildPersonalizedSearches(items, styleProfile);
      const results = await Promise.all(searches.map(async (spec) => {
        const candidates = await searchGlobalProducts(spec.query);
        return candidates.map((candidate) => ({ candidate, search: spec }));
      }));
      return {
        items,
        searches,
        suggestions: rankPersonalizedCandidates(results.flat(), items, styleProfile),
      };
    },
  });

  const filteredLists = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return publicLists;
    return publicLists.filter((wishlist) => wishlist.name.toLowerCase().includes(query));
  }, [publicLists, search]);

  return (
    <AppShell>
      <div className="min-h-screen pb-24">
        <Header title="Discover" />
        <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-8 sm:py-9">
          <section className="relative overflow-hidden rounded-[2rem] bg-[#35151f] p-6 text-white sm:p-9">
            <div className="absolute -right-8 -top-20 h-56 w-56 rounded-full bg-[#a4515d]/30 blur-3xl" />
            <div className="relative max-w-2xl">
              <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-[#edc2b8]"><Compass className="h-5 w-5" /></span>
              <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Find inspiration. Save what matters.</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-white/70">Browse wishlists people have chosen to share, or search for a product and compare available sources.</p>
              <Button asChild className="gradient-primary mt-6 rounded-xl text-white hover:opacity-95">
                <Link to="/items/add" className="flex items-center gap-2">Search products<Sparkles className="h-4 w-4" /></Link>
              </Button>
            </div>
          </section>

          {authProfile?.id && <section className="space-y-5" aria-labelledby="personalized-discovery-title">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.16em] text-brand">Picked for you</p>
                <h2 id="personalized-discovery-title" className="mt-1 flex items-center gap-2 font-display text-2xl font-bold text-ink"><Heart className="h-5 w-5 text-brand" />Personalized discovery</h2>
                <p className="mt-1 max-w-2xl text-sm text-ink-2">Suggestions use products in your wishlists and your saved brand, style, and size preferences.</p>
              </div>
              <Button type="button" variant="outline" onClick={() => void refreshPersonal()} disabled={isRefreshingPersonal} className="rounded-xl border-line bg-white text-ink">
                {isRefreshingPersonal ? 'Searching…' : 'Refresh suggestions'}
              </Button>
            </div>

            {isLoadingPersonal ? (
              <div className="glass-card p-8 text-center text-sm text-ink-2" aria-live="polite">Finding products based on your wishlist and preferences…</div>
            ) : personalError ? (
              <div className="glass-card flex flex-col items-center px-6 py-8 text-center">
                <p className="text-sm font-semibold text-ink">Personalized discovery could not load</p>
                <p className="mt-1 text-sm text-ink-2">Your wishlists are unchanged. Try searching again.</p>
                <Button type="button" variant="outline" onClick={() => void refreshPersonal()} className="mt-4 rounded-xl">Try again</Button>
              </div>
            ) : personalFeed?.suggestions.length ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {personalFeed.suggestions.slice(0, 12).map(({ candidate, reason, preferredSize }, index) => (
                  <PersonalDiscoveryCard key={`${candidate.gtin || candidate.url || candidate.title}-${index}`} candidate={candidate} reason={reason} preferredSize={preferredSize} />
                ))}
              </div>
            ) : (
              <div className="glass-card flex flex-col items-center px-6 py-9 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand"><Sparkles className="h-5 w-5" /></span>
                <h3 className="mt-4 font-display text-lg font-bold text-ink">{personalFeed?.items.length ? 'No suggestions found yet' : 'Add a few wishlist products to get started'}</h3>
                <p className="mt-2 max-w-lg text-sm leading-6 text-ink-2">{personalFeed?.items.length ? 'Search uses configured shopping sources and your saved preferences. Add size, style, or brand preferences to make results more personal.' : 'Wishly will use your saved products as inspiration, then tailor fashion suggestions to your sizes and fit preferences.'}</p>
                <Button asChild variant="outline" className="mt-5 rounded-xl border-line bg-white text-ink"><Link to={personalFeed?.items.length ? '/profile' : '/items/add'}>{personalFeed?.items.length ? 'Update my sizes and style' : 'Add a product'}</Link></Button>
              </div>
            )}
            {personalFeed?.suggestions.length ? <p className="text-[11px] text-ink-3">Search results are discovery suggestions. Prices and size availability must be confirmed on the retailer page.</p> : null}
          </section>}

          <section className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.16em] text-brand">Community</p>
                <h2 className="mt-1 font-display text-2xl font-bold text-ink">Shared wishlists</h2>
              </div>
              <div className="w-full sm:max-w-sm">
                <SearchBar value={search} onChange={setSearch} placeholder="Search shared lists..." />
              </div>
            </div>

            {isLoading ? (
              <div className="glass-card p-8 text-center text-sm text-ink-2">Loading shared wishlists…</div>
            ) : filteredLists.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredLists.map((wishlist) => (
                  <ListCard key={wishlist.id} wishlist={wishlist} itemCount={wishlist.item_count || 0} />
                ))}
              </div>
            ) : (
              <div className="glass-card flex flex-col items-center px-6 py-12 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand"><Search className="h-5 w-5" /></span>
                <h3 className="mt-4 font-display text-lg font-bold text-ink">{search ? 'No shared lists match that search' : 'No shared wishlists yet'}</h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-ink-2">Create your own list, add products from supported sources, and share it when you are ready.</p>
                <Button asChild variant="outline" className="mt-5 rounded-xl border-line bg-white text-ink">
                  <Link to="/wishlists/new" className="flex items-center gap-2">Create a wishlist<ArrowUpRight className="h-4 w-4" /></Link>
                </Button>
              </div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function PersonalDiscoveryCard({ candidate, reason, preferredSize }: { candidate: ProductCandidate; reason: string; preferredSize: string | null }) {
  return <article className="group overflow-hidden rounded-2xl border border-line bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
    <div className="relative aspect-[4/3] bg-[#F7EFEC]">
      {candidate.image_url ? <img src={candidate.image_url} alt={candidate.title} loading="lazy" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-sm text-ink-3">No product image</div>}
      <Badge variant="secondary" className="absolute left-3 top-3 bg-white/90 text-ink">{candidate.store || candidate.source}</Badge>
    </div>
    <div className="space-y-3 p-4">
      <div>
        <h3 className="line-clamp-2 min-h-10 text-sm font-semibold text-ink">{candidate.title}</h3>
        <p className="mt-1 line-clamp-1 text-xs text-ink-2">{reason}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline" className="border-line text-ink-2">{preferredSize ? `Size ${preferredSize} shown in listing` : 'Size availability not shown'}</Badge>
        <Badge variant="outline" className="border-line text-ink-2">Retailer details unverified</Badge>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
        <div>
          {candidate.price != null && candidate.price > 0 ? <><span className="block text-sm font-bold text-ink">{formatPrice(candidate.price, (candidate.currency || 'USD') as Currency)}</span><span className="text-[10px] text-ink-3">Listed search price</span></> : <span className="text-xs text-ink-3">Price unavailable</span>}
        </div>
        <div className="flex gap-2">
          {candidate.url && <Button asChild size="sm" variant="outline" className="h-8 rounded-lg border-line px-2.5"><a href={candidate.url} target="_blank" rel="noopener noreferrer" aria-label={`View ${candidate.title} at ${candidate.store || 'retailer'}`}><ExternalLink className="h-3.5 w-3.5" /></a></Button>}
          <Button asChild size="sm" className="h-8 rounded-lg gradient-primary text-white"><Link to={`/items/add?search=${encodeURIComponent(candidate.title)}`}>Save product</Link></Button>
        </div>
      </div>
    </div>
  </article>;
}
