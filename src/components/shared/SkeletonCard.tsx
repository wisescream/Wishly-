import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface SkeletonCardProps {
  mode?: 'list-card' | 'item-grid' | 'item-list';
  className?: string;
}

export function SkeletonCard({ mode = 'list-card', className }: SkeletonCardProps) {
  if (mode === 'list-card') {
    return (
      <Card
        className={cn(
          'overflow-hidden rounded-2xl glass-card border border-white/5 p-3 space-y-3',
          className
        )}
      >
        <Skeleton className="w-full aspect-[4/3] rounded-xl shimmer" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-3/4 rounded-md" />
          <Skeleton className="h-3 w-1/2 rounded-md" />
        </div>
      </Card>
    );
  }

  if (mode === 'item-list') {
    return (
      <div
        className={cn(
          'flex items-center gap-3 p-3 rounded-2xl glass-card border border-white/5',
          className
        )}
      >
        <Skeleton className="w-16 h-16 rounded-xl shrink-0 shimmer" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4 rounded-md" />
          <Skeleton className="h-3 w-1/3 rounded-md" />
        </div>
        <Skeleton className="w-12 h-6 rounded-md" />
      </div>
    );
  }

  // default 'item-grid'
  return (
    <Card
      className={cn(
        'overflow-hidden rounded-2xl glass-card border border-white/5 p-3 space-y-2.5',
        className
      )}
    >
      <Skeleton className="w-full aspect-square rounded-xl shimmer" />
      <Skeleton className="h-3.5 w-4/5 rounded-md" />
      <div className="flex justify-between items-center pt-1">
        <Skeleton className="h-4 w-1/3 rounded-md" />
        <Skeleton className="h-3 w-1/4 rounded-md" />
      </div>
    </Card>
  );
}
