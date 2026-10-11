import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Compass, Search, Sparkles } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Header } from '@/components/layout/Header';
import { SearchBar } from '@/components/shared/SearchBar';
import { ListCard } from '@/components/shared/ListCard';
import { Button } from '@/components/ui/button';
import { getPublicWishlists } from '@/lib/api';

export default function Discover() {
  const [search, setSearch] = useState('');
  const { data: publicLists = [], isLoading } = useQuery({
    queryKey: ['public-wishlists'],
    queryFn: () => getPublicWishlists(24),
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
