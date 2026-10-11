import React from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, UserCheck, Clock } from 'lucide-react';
import type { Profile } from '@/types/database';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { getInitials } from '@/lib/utils';

interface UserCardProps {
  profile: Profile;
  friendshipStatus?: 'none' | 'pending' | 'accepted';
  onAction?: () => void;
  className?: string;
}

export function UserCard({
  profile,
  friendshipStatus = 'none',
  onAction,
  className,
}: UserCardProps) {
  return (
    <div
      className={`flex items-center justify-between p-3 rounded-2xl glass-card border border-border/40 hover:border-border/70 transition-colors ${
        className || ''
      }`}
    >
      <Link
        to={`/friends/${profile.username}`}
        className="flex items-center gap-3 min-w-0 flex-1 group"
      >
        <Avatar className="w-10 h-10 border border-border">
          <AvatarImage src={profile.avatar_url || ''} />
          <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
            {profile.display_name ? getInitials(profile.display_name) : 'U'}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
            {profile.display_name || profile.username}
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            @{profile.username}
          </p>
        </div>
      </Link>

      {onAction && (
        <Button
          size="sm"
          variant={friendshipStatus === 'accepted' ? 'secondary' : 'default'}
          onClick={onAction}
          className={`h-8 px-3 rounded-xl text-xs shrink-0 ${
            friendshipStatus === 'none'
              ? 'gradient-primary text-white shadow-sm'
              : ''
          }`}
        >
          {friendshipStatus === 'none' && (
            <>
              <UserPlus className="w-3.5 h-3.5 mr-1" />
              <span>Add</span>
            </>
          )}
          {friendshipStatus === 'pending' && (
            <>
              <Clock className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
              <span>Pending</span>
            </>
          )}
          {friendshipStatus === 'accepted' && (
            <>
              <UserCheck className="w-3.5 h-3.5 mr-1 text-emerald-400" />
              <span>Friends</span>
            </>
          )}
        </Button>
      )}
    </div>
  );
}
