import React from 'react';
import { Plus, ExternalLink, Sparkles } from 'lucide-react';
import type { AiSuggestion } from '@/types/database';
import { type Currency, formatPrice } from '@/lib/currency';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ProductCardProps {
  suggestion: AiSuggestion;
  onAdd: (suggestion: AiSuggestion) => void;
  className?: string;
}

export function ProductCard({ suggestion, onAdd, className }: ProductCardProps) {
  return (
    <div
      className={`group flex items-start gap-3 p-3 rounded-2xl glass-card border border-border/50 hover:border-purple-500/40 transition-all ${
        className || ''
      }`}
    >
      <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-card shrink-0">
        <img
          src={suggestion.image_url}
          alt={suggestion.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {suggestion.store && (
          <span className="absolute bottom-1 left-1 bg-black/70 text-white text-[9px] font-medium px-1.5 py-0.2 rounded-md backdrop-blur-sm">
            {suggestion.store}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-between h-full">
        <div>
          <h4 className="text-xs font-semibold text-foreground line-clamp-1">
            {suggestion.title}
          </h4>
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
            {suggestion.reason}
          </p>
        </div>

        <div className="flex items-center justify-between mt-2 pt-1 border-t border-border/40">
          <span className="text-xs font-bold text-foreground">
            {formatPrice(suggestion.price, suggestion.currency as Currency)}
          </span>

          <div className="flex items-center gap-1.5">
            {suggestion.url && (
              <Button
                variant="ghost"
                size="icon"
                asChild
                className="w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground"
              >
                <a href={suggestion.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </Button>
            )}

            <Button
              size="sm"
              onClick={() => onAdd(suggestion)}
              className="h-7 px-2.5 rounded-lg text-[11px] gradient-primary text-white font-medium"
            >
              <Plus className="w-3 h-3 mr-1" />
              <span>Add</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
