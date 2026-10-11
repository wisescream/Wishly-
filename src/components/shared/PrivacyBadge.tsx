import React from 'react';
import { Lock, Users, Globe } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Privacy } from '@/types/database';
import { cn } from '@/lib/utils';

interface PrivacyBadgeProps {
  privacy: Privacy;
  className?: string;
}

export function PrivacyBadge({ privacy, className }: PrivacyBadgeProps) {
  const configs = {
    private: {
      label: 'Private',
      icon: Lock,
      variant: 'secondary' as const,
      className: 'bg-muted/80 text-muted-foreground border-border/40',
    },
    friends: {
      label: 'Friends',
      icon: Users,
      variant: 'secondary' as const,
      className: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    },
    public: {
      label: 'Public',
      icon: Globe,
      variant: 'secondary' as const,
      className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    },
  };

  const config = configs[privacy] || configs.public;
  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px] font-medium px-2 py-0.5 gap-1 inline-flex items-center rounded-full',
        config.className,
        className
      )}
    >
      <Icon className="w-3 h-3" />
      <span>{config.label}</span>
    </Badge>
  );
}
