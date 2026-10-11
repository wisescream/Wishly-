import React from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SearchBarProps {
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  loading?: boolean;
  className?: string;
}

export function SearchBar({
  placeholder = 'Search...',
  value,
  onChange,
  loading = false,
  className,
}: SearchBarProps) {
  return (
    <div className={cn('relative flex items-center w-full', className)}>
      <Search className="absolute left-3.5 w-4 h-4 text-muted-foreground pointer-events-none" />
      <Input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-9 pr-9 py-2 bg-card/60 backdrop-blur-md rounded-2xl border-border/50 text-xs placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary"
      />
      {loading ? (
        <Loader2 className="absolute right-3.5 w-4 h-4 text-muted-foreground animate-spin" />
      ) : value ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onChange('')}
          className="absolute right-1 w-7 h-7 rounded-full text-muted-foreground hover:text-foreground"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
