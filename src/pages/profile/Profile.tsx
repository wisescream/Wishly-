import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Settings,
  Crown,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Header } from '@/components/layout/Header';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ListCard } from '@/components/shared/ListCard';
import { MySizes } from '@/components/profile/MySizes';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { getWishlists, getStyleProfile } from '@/lib/api';
import { getInitials } from '@/lib/utils';
import { COUNTRIES } from '@/lib/constants';

export default function Profile() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { currency } = useCurrency();

  const { data: lists = [] } = useQuery({
    queryKey: ['my-wishlists', profile?.id],
    queryFn: () => (profile?.id ? getWishlists(profile.id) : Promise.resolve([])),
    enabled: !!profile?.id,
  });

  const { data: styleProfile } = useQuery({
    queryKey: ['style-profile', profile?.id],
    queryFn: () => (profile?.id ? getStyleProfile(profile.id) : Promise.resolve(null)),
    enabled: !!profile?.id,
  });

  const countryMeta = COUNTRIES.find((c) => c.code === profile?.country) || COUNTRIES[0];

  return (
    <AppShell>
      <div className="min-h-screen pb-24">
        <Header
          title="My Profile"
          actions={
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/settings')}
              className="w-8 h-8 rounded-full"
            >
              <Settings className="w-4 h-4" />
            </Button>
          }
        />

        <div className="p-4 sm:p-6 max-w-xl mx-auto space-y-6">
          {/* Main User Profile Card */}
          <div className="relative p-6 rounded-3xl glass-card border border-border/50 text-center space-y-3">
            <div className="relative inline-block">
              <Avatar className="w-24 h-24 border-4 border-background shadow-xl">
                <AvatarImage src={profile?.avatar_url || ''} />
                <AvatarFallback className="text-xl font-bold bg-primary/20 text-primary">
                  {profile?.display_name ? getInitials(profile.display_name) : 'U'}
                </AvatarFallback>
              </Avatar>
              {profile?.is_premium && (
                <div className="absolute bottom-0 right-0 bg-amber-500 text-black p-1.5 rounded-full shadow-lg">
                  <Crown className="w-3.5 h-3.5 stroke-[3]" />
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-center gap-2">
                <h2 className="text-lg font-bold text-foreground">
                  {profile?.display_name || profile?.username || 'Shopper'}
                </h2>
                <span className="text-sm">{countryMeta.flag}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                @{profile?.username || 'username'}
              </p>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/40">
              <div className="p-2">
                <span className="block text-base font-extrabold text-foreground">
                  {lists.length}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                  Lists
                </span>
              </div>
              <div className="p-2">
                <span className="block text-base font-extrabold text-foreground">
                  {currency}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                  Currency
                </span>
              </div>
              <div className="p-2">
                <span className="block text-base font-extrabold text-foreground">
                  {profile?.is_premium ? 'VIP' : 'Free'}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                  Tier
                </span>
              </div>
            </div>
          </div>

          {profile?.id && <MySizes userId={profile.id} profile={styleProfile || null} />}

          {/* My Wishlists Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                My Public Wishlists
              </h3>
              <Button
                variant="link"
                size="sm"
                onClick={() => navigate('/wishlists')}
                className="text-xs text-primary p-0 h-auto font-semibold"
              >
                Manage all
              </Button>
            </div>

            {lists.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {lists.slice(0, 4).map((wl) => (
                  <ListCard key={wl.id} wishlist={wl} itemCount={0} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">
                No wishlists created yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
