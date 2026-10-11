import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home,
  LayoutGrid,
  Compass,
  Sparkles,
  Users,
  Bell,
  Settings,
  PlusCircle,
  Crown,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn, getInitials } from '@/lib/utils';

export function Sidebar() {
  const { profile } = useAuth();
  const { t } = useI18n();

  const links = [
    { to: '/home', label: t.nav.home, icon: Home },
    { to: '/wishlists', label: t.nav.lists, icon: LayoutGrid },
    { to: '/discover', label: t.nav.discover, icon: Compass },
    { to: '/ai', label: t.nav.aiAssistant, icon: Sparkles, badge: 'AI' },
    { to: '/friends', label: t.nav.friends, icon: Users },
    { to: '/notifications', label: t.nav.notifications, icon: Bell },
  ];

  return (
    <aside className="w-64 h-screen sticky top-0 flex flex-col justify-between bg-card/60 backdrop-blur-xl border-r border-border/50 p-4">
      <div className="space-y-6">
        {/* Brand */}
        <div className="flex items-center justify-between px-2 pt-2">
          <NavLink to="/home" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center shadow-md shadow-purple-500/20 group-hover:scale-105 transition-transform">
              <span className="text-white font-extrabold text-lg">W</span>
            </div>
            <div>
              <span className="text-lg font-bold gradient-text">Wishly</span>
              <span className="block text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
                Product discovery
              </span>
            </div>
          </NavLink>
        </div>

        {/* Quick Add CTA */}
        <NavLink
          to="/items/add"
          className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl gradient-primary text-white font-medium text-sm shadow-md shadow-purple-500/20 hover:opacity-95 transition-all"
        >
          <PlusCircle className="w-4 h-4" />
          <span>{t.items.addItem}</span>
        </NavLink>

        {/* Navigation list */}
        <nav className="space-y-1">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  )
                }
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4" />
                  <span>{link.label}</span>
                </div>
                {link.badge && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-primary/20 text-primary">
                    {link.badge}
                  </Badge>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="space-y-3 pt-4">
        {/* Premium Banner */}
        <NavLink
          to="/premium"
          className="block p-3 rounded-xl bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-purple-500/10 border border-amber-500/20 hover:border-amber-500/40 transition-colors"
        >
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs mb-1">
            <Crown className="w-3.5 h-3.5" />
            <span>Wishly Premium</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Unlimited tracking & AI gifts from 49 MAD/mo
          </p>
        </NavLink>

        <Separator className="bg-border/50" />

        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            )
          }
        >
          <Settings className="w-4 h-4" />
          <span>{t.settings.title}</span>
        </NavLink>

        {/* User Mini Profile */}
        <NavLink
          to="/profile"
          className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/50 transition-colors"
        >
          <Avatar className="w-9 h-9 border border-border">
            <AvatarImage src={profile?.avatar_url || ''} />
            <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
              {profile?.display_name ? getInitials(profile.display_name) : 'ME'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate text-foreground">
              {profile?.display_name || profile?.username || 'Guest'}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              @{profile?.username || 'user'}
            </p>
          </div>
        </NavLink>
      </div>
    </aside>
  );
}
