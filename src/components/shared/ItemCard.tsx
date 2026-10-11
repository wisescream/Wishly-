import React from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Gift, Check, Flame } from 'lucide-react';
import type { Item } from '@/types/database';
import { type Currency, formatPrice } from '@/lib/currency';
import { PriorityBadge } from './PriorityBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ItemCardProps {
  item: Item;
  mode?: 'grid' | 'list';
  onReserve?: (id: string) => void;
  onBuy?: (item: Item) => void;
  showActions?: boolean;
  className?: string;
}

export function ItemCard({
  item,
  mode = 'grid',
  onReserve,
  onBuy,
  showActions = true,
  className,
}: ItemCardProps) {
  const isReserved = item.status === 'reserved';
  const isPurchased = item.status === 'purchased';

  if (mode === 'list') {
    return (
      <div
        className={cn(
          'flex items-center gap-3 p-3 rounded-2xl glass-card border border-border/50 hover:border-border/80 transition-all touch-feedback',
          (isReserved || isPurchased) && 'opacity-85',
          className
        )}
      >
        <Link to={`/items/${item.id}`} className="relative w-16 h-16 rounded-xl overflow-hidden bg-card shrink-0">
          {item.image_url ? (
            <img src={item.image_url} alt={item.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xl bg-muted/40">🎁</div>
          )}
          {item.priority === 3 && (
            <span className="absolute top-1 left-1 bg-black/60 rounded-full p-0.5 text-xs">
              <Flame className="w-3 h-3 text-orange-400" />
            </span>
          )}
        </Link>

        <div className="flex-1 min-w-0">
          <Link to={`/items/${item.id}`}>
            <h4 className="text-xs font-semibold text-foreground truncate hover:text-primary transition-colors">
              {item.title}
            </h4>
          </Link>
          <div className="flex items-center gap-2 mt-1">
            {item.current_price !== null && (
              <span className="text-xs font-bold text-foreground">
                {formatPrice(item.current_price, item.currency as Currency)}
              </span>
            )}
            {item.store && (
              <span className="text-[10px] text-muted-foreground truncate">
                • {item.store}
              </span>
            )}
          </div>
        </div>

        {showActions && (
          <div className="flex items-center gap-1 shrink-0">
            {isReserved ? (
              <Badge variant="secondary" className="text-[10px] bg-purple-500/10 text-purple-400 border-purple-500/20">
                Reserved
              </Badge>
            ) : isPurchased ? (
              <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                Purchased
              </Badge>
            ) : (
              onReserve && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onReserve(item.id)}
                  className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Gift className="w-3.5 h-3.5" />
                </Button>
              )
            )}
          </div>
        )}
      </div>
    );
  }

  // Grid mode
  return (
    <div
      className={cn(
        'group flex flex-col justify-between overflow-hidden rounded-2xl glass-card border border-border/50 hover:border-purple-500/40 transition-all duration-200 touch-feedback hover:-translate-y-0.5',
        (isReserved || isPurchased) && 'opacity-85',
        className
      )}
    >
      <Link to={`/items/${item.id}`} className="block relative aspect-square w-full overflow-hidden bg-card/60">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl bg-muted/40">🎁</div>
        )}

        <div className="absolute top-2 left-2 flex gap-1 z-10">
          <PriorityBadge priority={item.priority} />
        </div>

        {isReserved && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-10">
            <Badge className="bg-purple-600 text-white font-bold text-xs px-3 py-1 shadow-lg">
              Reserved
            </Badge>
          </div>
        )}

        {isPurchased && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-10">
            <Badge className="bg-emerald-600 text-white font-bold text-xs px-3 py-1 shadow-lg">
              Purchased
            </Badge>
          </div>
        )}
      </Link>

      <div className="p-3 flex flex-col flex-1 justify-between gap-2">
        <div>
          <Link to={`/items/${item.id}`}>
            <h3 className="text-xs font-semibold text-foreground line-clamp-2 hover:text-primary transition-colors">
              {item.title}
            </h3>
          </Link>

          <div className="flex items-center justify-between mt-1.5">
            {item.current_price !== null && (
              <span className="text-sm font-extrabold text-foreground">
                {formatPrice(item.current_price, item.currency as Currency)}
              </span>
            )}
            {item.store && (
              <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
                {item.store}
              </span>
            )}
          </div>
        </div>

        {showActions && (
          <div className="flex items-center gap-1.5 pt-1 border-t border-border/40">
            {item.url && (
              <Button
                variant="outline"
                size="sm"
                asChild
                className="flex-1 h-7 text-[11px] rounded-xl border-border/50 hover:bg-muted/60"
              >
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  <span>Store</span>
                  <ExternalLink className="w-3 h-3 ml-1" />
                </a>
              </Button>
            )}

            {!isReserved && !isPurchased && onReserve && (
              <Button
                size="sm"
                onClick={() => onReserve(item.id)}
                className="h-7 px-2.5 text-[11px] rounded-xl gradient-primary text-white"
              >
                <Gift className="w-3 h-3 mr-1" />
                <span>Reserve</span>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
