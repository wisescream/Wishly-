import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, LayoutGrid, Plus, Compass, User } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { cn } from '@/lib/utils';

export function BottomNav() {
  const { t } = useI18n();

  const navItems = [
    { to: '/home', label: t.nav.home, icon: Home },
    { to: '/wishlists', label: t.nav.lists, icon: LayoutGrid },
    { to: '/items/add', label: t.nav.add, icon: Plus, isAction: true },
    { to: '/discover', label: t.nav.discover, icon: Compass },
    { to: '/profile', label: t.nav.profile, icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card/90 backdrop-blur-xl border-t border-border/50 safe-bottom">
      <div className="flex items-center justify-around h-16 max-w-md mx-auto px-2">
        {navItems.map((item) => {
          const Icon = item.icon;

          if (item.isAction) {
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className="relative -top-5 flex items-center justify-center w-12 h-12 rounded-full gradient-primary text-white shadow-lg shadow-purple-500/30 touch-feedback hover:opacity-95"
                aria-label={item.label}
              >
                <Icon className="w-6 h-6 stroke-[2.5]" />
              </NavLink>
            );
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center flex-1 py-1 text-xs font-medium transition-colors touch-feedback',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn('w-5 h-5 mb-1', isActive && 'stroke-[2.5]')} />
                  <span className="truncate max-w-[64px]">{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
