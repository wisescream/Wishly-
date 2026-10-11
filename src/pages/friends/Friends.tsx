import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, UserPlus, Users, Cake, Check, X } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Header } from '@/components/layout/Header';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { UserCard } from '@/components/shared/UserCard';
import { SearchBar } from '@/components/shared/SearchBar';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import {
  getFriends,
  getFriendRequests,
  searchProfiles,
  sendFriendRequest,
  respondToFriendRequest,
} from '@/lib/api';
import type { Profile } from '@/types/database';
import { toast } from 'sonner';

export default function Friends() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const { data: friends = [], isLoading: friendsLoading } = useQuery({
    queryKey: ['friends', profile?.id],
    queryFn: () => (profile?.id ? getFriends(profile.id) : Promise.resolve([])),
    enabled: !!profile?.id,
  });

  const { data: requests = [] } = useQuery({
    queryKey: ['friend-requests', profile?.id],
    queryFn: () => (profile?.id ? getFriendRequests(profile.id) : Promise.resolve([])),
    enabled: !!profile?.id,
  });

  const { data: searchResults = [] } = useQuery({
    queryKey: ['search-users', search],
    queryFn: () => (search.length >= 2 ? searchProfiles(search) : Promise.resolve([])),
    enabled: search.length >= 2,
  });

  const addFriendMutation = useMutation({
    mutationFn: (targetId: string) => sendFriendRequest(profile!.id, targetId),
    onSuccess: () => {
      toast.success('Friend request sent!');
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    },
  });

  const respondMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'accepted' | 'declined' }) =>
      respondToFriendRequest(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
      toast.success('Updated request');
    },
  });

  return (
    <AppShell>
      <div className="min-h-screen pb-24">
        <Header title="Friends & Social" />

        <div className="p-4 sm:p-6 max-w-xl mx-auto space-y-5">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search friends by username or name..."
          />

          {/* Search Results Display */}
          {search.length >= 2 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Search Results
              </h3>
              {searchResults.length > 0 ? (
                <div className="space-y-2">
                  {searchResults
                    .filter((u) => u.id !== profile?.id)
                    .map((user) => (
                      <UserCard
                        key={user.id}
                        profile={user}
                        friendshipStatus="none"
                        onAction={() => addFriendMutation.mutate(user.id)}
                      />
                    ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No users found.</p>
              )}
            </div>
          )}

          {/* Tabs for My Friends vs Incoming Requests */}
          <Tabs defaultValue="friends" className="w-full">
            <TabsList className="grid grid-cols-2 rounded-2xl bg-card/60 p-1 border border-border/50">
              <TabsTrigger value="friends" className="rounded-xl text-xs font-semibold">
                Friends ({friends.length})
              </TabsTrigger>
              <TabsTrigger value="requests" className="rounded-xl text-xs font-semibold">
                Requests ({requests.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="friends" className="space-y-3 mt-4">
              {friends.length > 0 ? (
                <div className="space-y-2">
                  {friends.map((f) => (
                    <UserCard
                      key={f.id}
                      profile={f.profile}
                      friendshipStatus="accepted"
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  emoji="👥"
                  title="No friends connected yet"
                  description="Add your friends to view their wishlists and reserve gifts anonymously!"
                />
              )}
            </TabsContent>

            <TabsContent value="requests" className="space-y-3 mt-4">
              {requests.length > 0 ? (
                <div className="space-y-2">
                  {requests.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between p-3 rounded-2xl glass-card border border-border/40"
                    >
                      <div>
                        <h4 className="text-xs font-bold text-foreground">
                          {req.profile.display_name || req.profile.username}
                        </h4>
                        <p className="text-[11px] text-muted-foreground">
                          @{req.profile.username} wants to connect
                        </p>
                      </div>

                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          onClick={() =>
                            respondMutation.mutate({ id: req.id, status: 'accepted' })
                          }
                          className="h-8 px-2.5 rounded-xl gradient-primary text-white text-xs font-semibold"
                        >
                          <Check className="w-3.5 h-3.5 mr-1" />
                          <span>Accept</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            respondMutation.mutate({ id: req.id, status: 'declined' })
                          }
                          className="h-8 px-2.5 rounded-xl text-xs text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  emoji="💌"
                  title="No pending friend requests"
                  description="When someone adds you, requests will show up here."
                />
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppShell>
  );
}
