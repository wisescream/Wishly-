import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, Bell, Loader2 } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { NotificationItem } from '@/components/shared/NotificationItem';
import { EmptyState } from '@/components/shared/EmptyState';
import { useAuth } from '@/contexts/AuthContext';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '@/lib/api';
import { toast } from 'sonner';

export default function Notifications() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', profile?.id],
    queryFn: () => (profile?.id ? getNotifications(profile.id) : Promise.resolve([])),
    enabled: !!profile?.id,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () => (profile?.id ? markAllNotificationsRead(profile.id) : Promise.resolve(false)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('All marked as read');
    },
  });

  const displayNotifications = notifications;

  const hasUnread = displayNotifications.some((n) => !n.read_at);

  return (
    <AppShell>
      <div className="min-h-screen pb-24">
        <Header
          title="Notifications"
          actions={
            hasUnread && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAllMutation.mutate()}
                className="text-xs text-primary font-semibold gap-1 h-8"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </Button>
            )
          }
        />

        <div className="p-4 sm:p-6 max-w-xl mx-auto space-y-2.5">
          {isLoading ? (
            <div className="flex justify-center p-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : displayNotifications.length > 0 ? (
            displayNotifications.map((notif) => (
              <NotificationItem
                key={notif.id}
                notification={notif}
                onMarkRead={(id) => markReadMutation.mutate(id)}
              />
            ))
          ) : (
            <EmptyState
              emoji="🔔"
              title="All caught up!"
              description="Price drops, friend gifts, and occasion reminders will appear here."
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
