import React from 'react';
import {
  TrendingDown,
  UserPlus,
  CheckCircle2,
  Calendar,
  Cake,
  Gift,
  Bell,
} from 'lucide-react';
import type { Notification, NotificationType } from '@/types/database';
import { timeAgo, cn } from '@/lib/utils';

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
