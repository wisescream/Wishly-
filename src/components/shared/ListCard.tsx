import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar } from 'lucide-react';
import type { Wishlist } from '@/types/database';
import { PrivacyBadge } from './PrivacyBadge';
import { OCCASIONS } from '@/lib/constants';

interface ListCardProps {
  wishlist: Wishlist;
  itemCount?: number;
  className?: string;
}

export function ListCard({ wishlist, itemCount = 0, className }: ListCardProps) {
  const occasionMeta = OCCASIONS.find((o) => o.value === wishlist.occasion);
  const gradientClass = occasionMeta?.gradient || 'from-violet-600 to-pink-500';

  return (
    <Link
      to={`/wishlists/${wishlist.id}`}
      className={`group block overflow-hidden rounded-2xl glass-card border border-border/50 hover:border-purple-500/40 transition-all duration-200 touch-feedback hover:-translate-y-0.5 ${
        className || ''
      }`}
    >
      {/* Cover / Header banner */}
      <div
        className={`relative aspect-[16/10] w-full bg-gradient-to-tr ${gradientClass} p-3 flex flex-col justify-between overflow-hidden`}
      >
        {wishlist.cover_url ? (
          <img
            src={wishlist.cover_url}
            alt={wishlist.name}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px]" />
        )}

        <div className="relative z-10 flex justify-between items-start">
          <PrivacyBadge privacy={wishlist.privacy} />
          {occasionMeta && (
            <span className="text-xl drop-shadow-md">
              {occasionMeta.emoji}
            </span>
          )}
        </div>

        {wishlist.event_date && (
          <div className="relative z-10 inline-flex items-center gap-1 text-[10px] text-white/90 bg-black/30 backdrop-blur-md px-2 py-0.5 rounded-full w-fit">
            <Calendar className="w-2.5 h-2.5" />
            <span>
              {new Date(wishlist.event_date).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3">
        <h3 className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">
          {wishlist.name}
        </h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </p>
      </div>
    </Link>
  );
}
