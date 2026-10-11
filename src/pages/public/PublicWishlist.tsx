import React from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Heart, Gift, Share2, ExternalLink, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ItemCard } from '@/components/shared/ItemCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { getPublicWishlist, reserveItem } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { getInitials } from '@/lib/utils';
import { OCCASIONS } from '@/lib/constants';
import { toast } from 'sonner';

export default function PublicWishlist() {
  const { username, slug } = useParams<{ username: string; slug: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { format } = useCurrency();

  const { data: wishlist, isLoading } = useQuery({
    queryKey: ['public-wishlist', username, slug],
    queryFn: () =>
      username && slug ? getPublicWishlist(username, slug) : Promise.resolve(null),
    enabled: !!username && !!slug,
  });

  const handleReserve = async (itemId: string) => {
    if (!profile) {
      toast.info('Please sign in or create an account to reserve gifts anonymously!');
      navigate('/auth/login');
      return;
    }

    const success = await reserveItem(itemId, profile.id);
    if (success) {
      toast.success('Reserved! The list owner will see it is reserved, but not who reserved it.');
      queryClient.invalidateQueries({ queryKey: ['public-wishlist', username, slug] });
    } else {
      toast.error('Failed to reserve item');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!wishlist) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-center">
        <EmptyState
          emoji="🎁"
          title="Wishlist not found"
          description="This public wishlist does not exist or may have been set to private."
          action={{ label: 'Go to Wishly Home', onClick: () => navigate('/') }}
        />
      </div>
    );
  }

  const occasionMeta = OCCASIONS.find((o) => o.value === wishlist.occasion);
  const items = wishlist.items || [];
  const reservedCount = items.filter((i) => i.status === 'reserved').length;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col pb-16">
      {/* Brand Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-3.5 backdrop-blur-xl bg-background/80 border-b border-border/40">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center shadow-md">
            <span className="text-white font-extrabold text-base">W</span>
          </div>
          <span className="font-extrabold text-base tracking-tight gradient-text">
            Wishly
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline" className="text-xs rounded-xl h-8">
            <Link to="/auth/login">Sign In</Link>
          </Button>
          <Button asChild size="sm" className="gradient-primary text-white text-xs rounded-xl h-8">
            <Link to="/auth/register">Create a Wishlist</Link>
          </Button>
        </div>
      </header>

      {/* Main Container */}
      <main className="p-4 sm:p-6 max-w-3xl mx-auto w-full space-y-6">
        {/* Wishlist Header Card */}
        <div className="relative rounded-3xl overflow-hidden glass-card border border-border/50 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Avatar className="w-12 h-12 border-2 border-primary/20">
              <AvatarImage src={wishlist.owner?.avatar_url || ''} />
              <AvatarFallback className="text-xs font-bold bg-primary/20 text-primary">
                {wishlist.owner?.display_name ? getInitials(wishlist.owner.display_name) : 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <span className="text-xs text-muted-foreground">Wishlist curated by</span>
              <h3 className="text-sm font-bold text-foreground">
                {wishlist.owner?.display_name || wishlist.owner?.username}
              </h3>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-foreground">{wishlist.name}</h1>
              {occasionMeta && <span className="text-2xl">{occasionMeta.emoji}</span>}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground pt-1">
              <span>{items.length} items</span>
              <span>•</span>
              <span className="text-emerald-400 font-medium">{reservedCount} reserved</span>
              {wishlist.event_date && (
                <>
                  <span>•</span>
                  <span>Event on {new Date(wishlist.event_date).toLocaleDateString()}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Gift Reservation Privacy Notice */}
        <div className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300 flex items-center gap-2.5">
          <Gift className="w-4 h-4 shrink-0" />
          <span>
            <strong>Anonymous Gifting:</strong> When you reserve an item, the recipient is notified that a gift is reserved without revealing who bought it.
          </span>
        </div>

        {/* Items Grid */}
        {items.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                mode="grid"
                onReserve={handleReserve}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            emoji="🎁"
            title="List is currently empty"
            description="The owner hasn't added items to this list yet."
          />
        )}

        {/* Bottom CTA to Create Own List */}
        <div className="mt-12 p-8 rounded-3xl glass-card border border-border/50 text-center space-y-4 bg-gradient-to-br from-purple-500/10 to-pink-500/5">
          <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center text-white mx-auto shadow-lg shadow-purple-500/20">
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold">Have an upcoming occasion?</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Create a wishlist, follow offers available from connected sources, and share it with people you care about.
            </p>
          </div>
          <Button asChild className="gradient-primary text-white font-semibold text-xs px-6 h-11 rounded-xl shadow-lg">
            <Link to="/auth/register">Create My Free Wishlist</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
