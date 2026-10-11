import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Cake, Calendar, Gift, Lock, Loader2 } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Header } from '@/components/layout/Header';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ListCard } from '@/components/shared/ListCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { getProfileByUsername, getWishlists } from '@/lib/api';
import { getInitials } from '@/lib/utils';

export default function FriendProfile() {
  const { username } = useParams<{ username: string }>();

  const { data: friend, isLoading: profileLoading } = useQuery({
    queryKey: ['friend-profile', username],
    queryFn: () => (username ? getProfileByUsername(username) : Promise.resolve(null)),
    enabled: !!username,
  });

  const { data: lists = [], isLoading: listsLoading } = useQuery({
    queryKey: ['friend-wishlists', friend?.id],
    queryFn: () => (friend?.id ? getWishlists(friend.id) : Promise.resolve([])),
    enabled: !!friend?.id,
  });

  if (profileLoading) {
    return (
      <AppShell>
        <Header showBack title="Loading profile..." />
        <div className="flex justify-center p-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  if (!friend) {
    return (
      <AppShell>
        <Header showBack title="User not found" />
        <div className="p-6">
          <EmptyState
            emoji="👤"
            title="User not found"
            description="The profile you are looking for does not exist."
          />
        </div>
      </AppShell>
    );
  }

  // Only show public or friends-visible lists
  const visibleLists = lists.filter((l) => l.privacy !== 'private');

  return (
    <AppShell>
      <div className="min-h-screen pb-24">
        <Header showBack title={`@${friend.username}`} />

        <div className="p-4 sm:p-6 max-w-xl mx-auto space-y-6">
          {/* Profile Header */}
          <div className="flex flex-col items-center text-center p-6 rounded-3xl glass-card border border-border/50">
            <Avatar className="w-20 h-20 border-2 border-primary/20 shadow-md mb-3">
              <AvatarImage src={friend.avatar_url || ''} />
              <AvatarFallback className="text-lg font-bold bg-primary/20 text-primary">
                {friend.display_name ? getInitials(friend.display_name) : 'U'}
              </AvatarFallback>
            </Avatar>

            <h2 className="text-lg font-extrabold text-foreground">
              {friend.display_name || friend.username}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">@{friend.username}</p>

            {friend.birthday && (
              <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 text-xs font-medium border border-rose-500/20">
                <Cake className="w-3.5 h-3.5" />
                <span>
                  Birthday:{' '}
                  {new Date(friend.birthday).toLocaleDateString(undefined, {
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              </div>
            )}
          </div>

          {/* Shared Lists */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Wishlists by {friend.display_name || friend.username}
            </h3>

            {visibleLists.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {visibleLists.map((wl) => (
                  <ListCard key={wl.id} wishlist={wl} itemCount={0} />
                ))}
              </div>
            ) : (
              <EmptyState
                emoji="🎁"
                title="No public wishlists"
                description="This user hasn't shared any public wishlists yet."
              />
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
