import React, { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  actions?: ReactNode;
  className?: string;
}

export function Header({
  title,
  subtitle,
  showBack = false,
  onBack,
  actions,
  className,
}: HeaderProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex items-center justify-between h-14 px-4 bg-background/80 backdrop-blur-xl border-b border-border/40',
        className
      )}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {showBack && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="w-9 h-9 rounded-full shrink-0 -ml-1 text-muted-foreground hover:text-foreground"
            aria-label="Go back"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
        )}
        <div className="min-w-0">
          {title && (
            <h1 className="text-base font-bold text-foreground truncate">
              {title}
            </h1>
          )}
          {subtitle && (
            <p className="text-[11px] text-muted-foreground truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {actions && (
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {actions}
        </div>
      )}
    </header>
  );
}
