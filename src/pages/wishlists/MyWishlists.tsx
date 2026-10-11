import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Sparkles, Crown } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { ListCard } from '@/components/shared/ListCard';
import { SkeletonCard } from '@/components/shared/SkeletonCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { UpgradeDialog } from '@/components/shared/UpgradeDialog';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { getWishlists } from '@/lib/api';
import { FREE_LIMITS } from '@/types/database';

export default function MyWishlists() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { t } = useI18n();
  const [showUpgrade, setShowUpgrade] = useState(false);

  const { data: lists = [], isLoading } = useQuery({
    queryKey: ['my-wishlists', profile?.id],
    queryFn: () => (profile?.id ? getWishlists(profile.id) : Promise.resolve([])),
    enabled: !!profile?.id,
  });

  const handleCreateClick = () => {
    if (!profile?.is_premium && lists.length >= FREE_LIMITS.maxLists) {
      setShowUpgrade(true);
      return;
    }
    navigate('/wishlists/new');
  };

  return (
    <AppShell>
      <div className="min-h-screen pb-24">
        <Header
          title={t.wishlists.myLists}
          subtitle={`${lists.length} of ${profile?.is_premium ? '∞' : FREE_LIMITS.maxLists} lists created`}
          actions={
            <Button
              size="sm"
              onClick={handleCreateClick}
              className="gradient-primary text-white text-xs font-semibold rounded-xl h-8 px-3 shadow-md shadow-purple-500/20"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              <span>Create</span>
            </Button>
          }
        />

        <div className="p-4 sm:p-6 max-w-4xl mx-auto">
          {/* Free Tier Limit Progress Banner */}
          {!profile?.is_premium && (
            <div className="mb-6 p-3 rounded-2xl glass-card border border-purple-500/20 bg-purple-500/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-muted-foreground">
                  Free tier: <strong>{lists.length} / {FREE_LIMITS.maxLists}</strong> lists used
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowUpgrade(true)}
                className="h-7 text-[11px] text-primary hover:text-primary font-semibold"
              >
                Go Unlimited
              </Button>
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <SkeletonCard key={i} mode="list-card" />
              ))}
            </div>
          ) : lists.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
              {lists.map((list) => (
                <ListCard key={list.id} wishlist={list} itemCount={0} />
              ))}
            </div>
          ) : (
            <EmptyState
              emoji="🎁"
              title={t.wishlists.noLists}
              description={t.wishlists.noListsDesc}
              action={{
                label: t.wishlists.createList,
                onClick: handleCreateClick,
              }}
            />
          )}
        </div>

        <UpgradeDialog
          feature="unlimited wishlists"
          isOpen={showUpgrade}
          onClose={() => setShowUpgrade(false)}
        />
      </div>
    </AppShell>
  );
}
