import React from 'react';
import {
  TrendingDown,
  UserPlus,
  CheckCircle2,
  Calendar,
  Cake,
  Gift,
  Bell,
  ExternalLink,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Notification, NotificationType } from '@/types/database';
import { timeAgo, cn } from '@/lib/utils';
import { formatPrice } from '@/lib/currency';
import { getNotificationAlertDetails } from '@/lib/notificationDetails';
import { formatProductCondition } from '@/lib/productCondition';

interface NotificationItemProps {
  notification: Notification;
  onMarkRead: (id: string) => void;
  className?: string;
}

export function NotificationItem({
  notification,
  onMarkRead,
  className,
}: NotificationItemProps) {
  const getIcon = (type: NotificationType) => {
    switch (type) {
      case 'price_drop':
        return <TrendingDown className="w-4 h-4 text-emerald-400" />;
      case 'back_in_stock':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'friend_request':
        return <UserPlus className="w-4 h-4 text-blue-400" />;
      case 'friend_accepted':
        return <CheckCircle2 className="w-4 h-4 text-purple-400" />;
      case 'occasion_reminder':
        return <Calendar className="w-4 h-4 text-amber-400" />;
      case 'birthday_reminder':
        return <Cake className="w-4 h-4 text-rose-400" />;
      case 'item_reserved':
        return <Gift className="w-4 h-4 text-pink-400" />;
      default:
        return <Bell className="w-4 h-4 text-primary" />;
    }
  };

  const isUnread = !notification.read_at;
  const isOfferAlert = notification.type === 'price_drop' || notification.type === 'back_in_stock';
  const details = isOfferAlert ? getNotificationAlertDetails(notification.payload) : null;
  const offerPrice = details?.price && details.currency ? formatPrice(details.price, details.currency) : null;
  const oldPrice = details?.oldPrice && details.currency ? formatPrice(details.oldPrice, details.currency) : null;
  const savings = details?.savings && details.currency ? formatPrice(details.savings, details.currency) : null;
  const checkedAt = details?.verifiedAt ? new Date(details.verifiedAt).toLocaleString('en-US', { timeZone: 'UTC' }) : null;
  const markRead = () => { if (isUnread) onMarkRead(notification.id); };

  return (
    <div
      onClick={() => isUnread && onMarkRead(notification.id)}
      className={cn(
        'flex items-start gap-3 p-3.5 rounded-2xl glass-card transition-all cursor-pointer relative overflow-hidden',
        isUnread
          ? 'border-purple-500/30 bg-purple-500/5'
          : 'border-border/30 opacity-75 hover:opacity-100',
        className
      )}
    >
      <div className="w-8 h-8 rounded-xl bg-card border border-border/50 flex items-center justify-center shrink-0 mt-0.5">
        {getIcon(notification.type)}
      </div>

      <div className="flex-1 min-w-0 pr-2">
        <h4 className="text-xs font-semibold text-foreground truncate">
          {notification.title}
        </h4>
        {notification.body && (
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
            {notification.body}
          </p>
        )}
        {details && (details.variant || details.condition || offerPrice || checkedAt) && <div className="mt-1.5 space-y-0.5 text-[10px] text-muted-foreground">
          {details.variant && <p>Variant: {details.variant}</p>}
          {details.condition && <p>Condition: {formatProductCondition(details.condition)}</p>}
          {offerPrice && <p>Offer: {offerPrice}{oldPrice ? ` · Saved listing: ${oldPrice}` : ''}{savings ? ` · Savings: ${savings}` : ''}</p>}
          {checkedAt && <p>Retailer page checked {checkedAt} UTC</p>}
        </div>}
        {details && (details.offerUrl || details.itemId) && <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-medium">
          {details.offerUrl && <a href={details.offerUrl} target="_blank" rel="noopener noreferrer"
            onClick={(event) => { event.stopPropagation(); markRead(); }}
            className="inline-flex items-center gap-1 text-primary hover:underline">
            Open retailer offer <ExternalLink className="w-3 h-3" />
          </a>}
          {details.itemId && <Link to={`/items/${encodeURIComponent(details.itemId)}`}
            onClick={(event) => { event.stopPropagation(); markRead(); }}
            className="text-primary hover:underline">
            View tracked item
          </Link>}
        </div>}
        <span className="text-[10px] text-muted-foreground/80 mt-1 block">
          {timeAgo(notification.created_at)}
        </span>
      </div>

      {isUnread && (
        <span className="w-2 h-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 shrink-0 mt-2" />
      )}
    </div>
  );
}
