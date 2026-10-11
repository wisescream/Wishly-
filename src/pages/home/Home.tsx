import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Sparkles,
  TrendingDown,
  Calendar,
  Plus,
  Compass,
  ArrowRight,
  Gift,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { SkeletonCard } from '@/components/shared/SkeletonCard';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { getWishlists, getFriendsWishlists } from '@/lib/api';
import { OCCASIONS } from '@/lib/constants';
import { getInitials } from '@/lib/utils';

export default function Home() {
  const { profile } = useAuth();
  const { t } = useI18n();

  const { data: myLists = [] } = useQuery({
    queryKey: ['my-wishlists', profile?.id],
    queryFn: () => (profile?.id ? getWishlists(profile.id) : Promise.resolve([])),
    enabled: !!profile?.id,
  });

  const { data: friendsLists = [] } = useQuery({
    queryKey: ['friends-wishlists', profile?.id],
    queryFn: () => (profile?.id ? getFriendsWishlists(profile.id) : Promise.resolve([])),
    enabled: !!profile?.id,
  });

  // Upcoming occasions from user wishlists with event_date
  const upcomingEvents = myLists
    .filter((l) => l.event_date && new Date(l.event_date) >= new Date())
    .sort((a, b) => new Date(a.event_date!).getTime() - new Date(b.event_date!).getTime())
    .slice(0, 4);

  return (
    <AppShell>
      <div className="min-h-screen pb-24">
        {/* Mobile Header / Welcome banner */}
        <div className="p-4 sm:p-6 bg-gradient-to-b from-purple-500/10 via-card/50 to-transparent">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Avatar className="w-11 h-11 border-2 border-primary/20 shadow-sm">
                <AvatarImage src={profile?.avatar_url || ''} />
                <AvatarFallback className="bg-primary/20 text-primary font-bold text-xs">
                  {profile?.display_name ? getInitials(profile.display_name) : 'ME'}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-[11px] text-muted-foreground font-medium">
                  Marhaba,
                </p>
                <h2 className="text-base font-extrabold text-foreground truncate max-w-[200px]">
                  {profile?.display_name || profile?.username || 'Shopper'} 👋
                </h2>
              </div>
            </div>

            <Button
              asChild
              size="sm"
              className="gradient-primary text-white text-xs font-semibold rounded-xl h-8 px-3 shadow-md shadow-purple-500/20"
            >
              <Link to="/items/add" className="flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" />
                <span>Add Item</span>
              </Link>
            </Button>
          </div>

          {/* Quick Actions Grid */}
          <div className="grid grid-cols-3 gap-2.5 pt-2">
            <Link
              to="/wishlists/new"
              className="flex flex-col items-center justify-center p-3 rounded-2xl glass-card border border-border/50 text-center touch-feedback hover:border-purple-500/40"
            >
              <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center mb-1.5">
                <Gift className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-semibold text-foreground">
                New List
              </span>
            </Link>

            <Link
              to="/ai"
              className="flex flex-col items-center justify-center p-3 rounded-2xl glass-card border border-border/50 text-center touch-feedback hover:border-purple-500/40"
            >
              <div className="w-8 h-8 rounded-xl bg-pink-500/10 text-pink-400 flex items-center justify-center mb-1.5">
                <Sparkles className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-semibold text-foreground">
                AI Assistant
              </span>
            </Link>

            <Link
              to="/discover"
              className="flex flex-col items-center justify-center p-3 rounded-2xl glass-card border border-border/50 text-center touch-feedback hover:border-purple-500/40"
            >
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-1.5">
                <Compass className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-semibold text-foreground">
                Discover
              </span>
            </Link>
          </div>
        </div>

        <div className="px-4 sm:px-6 space-y-7">
          {/* Upcoming Events Carousel */}
          {upcomingEvents.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-purple-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Upcoming Occasions
                  </h3>
                </div>
                <Link
                  to="/wishlists"
                  className="text-xs text-primary font-medium hover:underline flex items-center gap-0.5"
                >
                  <span>See all</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
                {upcomingEvents.map((event) => {
                  const occasionMeta = OCCASIONS.find(
                    (o) => o.value === event.occasion
                  );
                  const daysLeft = Math.ceil(
                    (new Date(event.event_date!).getTime() - new Date().getTime()) /
                      (1000 * 60 * 60 * 24)
                  );

                  return (
                    <Link
                      key={event.id}
                      to={`/wishlists/${event.id}`}
                      className="min-w-[180px] p-3.5 rounded-2xl glass-card border border-border/50 bg-gradient-to-br from-purple-500/10 to-pink-500/5 hover:border-purple-500/40 transition-all shrink-0 touch-feedback"
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-2xl">
                          {occasionMeta?.emoji || '🎉'}
                        </span>
                        <Badge
                          variant="secondary"
                          className="text-[9px] bg-purple-500/20 text-purple-300 font-bold px-1.5 py-0"
                        >
                          {daysLeft === 0
                            ? 'Today!'
                            : daysLeft === 1
                            ? 'Tomorrow'
                            : `${daysLeft} days`}
                        </Badge>
                      </div>
                      <h4 className="text-xs font-bold text-foreground truncate">
                        {event.name}
                      </h4>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(event.event_date!).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          <section className="glass-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand">
                <TrendingDown className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-display text-base font-bold text-foreground">Price tracking</h3>
                <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
                  Add a product to search connected shopping sources. Offers show their last check and any missing delivery costs.
                </p>
              </div>
            </div>
            <Button asChild size="sm" className="gradient-primary shrink-0 rounded-xl text-white">
              <Link to="/items/add">Add a product</Link>
            </Button>
          </section>

          {/* Friends Recent Activity */}
          {friendsLists.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Friends Activity
                </h3>
                <Link
                  to="/friends"
                  className="text-xs text-primary font-medium hover:underline"
                >
                  View friends
                </Link>
              </div>

              <div className="space-y-2">
                {friendsLists.slice(0, 3).map((fl) => (
                  <Link
                    key={fl.id}
                    to={`/wishlists/${fl.id}`}
                    className="flex items-center justify-between p-3 rounded-2xl glass-card border border-border/40 hover:border-purple-500/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={fl.owner?.avatar_url || ''} />
                        <AvatarFallback className="text-[10px]">
                          {fl.owner?.display_name ? getInitials(fl.owner.display_name) : 'F'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">
                          {fl.owner?.display_name || 'Friend'} created "{fl.name}"
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {fl.item_count || 0} items
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </AppShell>
  );
}
