import React from 'react';
import { Badge } from '@/components/ui/badge';
import { PRIORITIES } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface PriorityBadgeProps {
  priority: number;
  size?: 'sm' | 'md';
  className?: string;
}

export function PriorityBadge({ priority, size = 'sm', className }: PriorityBadgeProps) {
  const p = PRIORITIES.find((item) => item.value === priority) || PRIORITIES[0];

  return (
    <Badge
      variant="outline"
      className={cn(
        'font-medium rounded-full border-border/50 bg-card/60 backdrop-blur-md inline-flex items-center gap-1',
        size === 'sm' ? 'text-[10px] px-2 py-0.2' : 'text-xs px-2.5 py-0.5',
        p.color,
        className
      )}
    >
      <span>{p.emoji}</span>
      <span>{p.label}</span>
    </Badge>
  );
}
