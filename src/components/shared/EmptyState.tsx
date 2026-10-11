import React, { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  emoji?: string;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  children?: ReactNode;
  className?: string;
}

export function EmptyState({
  emoji = '✨',
  title,
  description,
  action,
  children,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center p-8 rounded-3xl glass-card max-w-sm mx-auto my-6 border border-white/5',
        className
      )}
    >
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-3xl mb-4 shadow-inner">
        {emoji}
      </div>
      <h3 className="text-base font-bold text-foreground mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground leading-relaxed mb-5 max-w-[260px]">
        {description}
      </p>
      {action && (
        <Button
          onClick={action.onClick}
          className="gradient-primary text-white font-medium text-xs px-5 py-2 rounded-xl shadow-md shadow-purple-500/20"
        >
          {action.label}
        </Button>
      )}
      {children}
    </div>
  );
}
