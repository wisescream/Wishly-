import React, { useState } from 'react';
import { Copy, Check, Share2, MessageCircle } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface ShareSheetProps {
  url: string;
  title: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ShareSheet({ url, title, isOpen, onClose }: ShareSheetProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(`Take a look at my wishlist "${title}" on Wishly: ${url}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Wishly — ${title}`,
          text: `Check out my wishlist: ${title}`,
          url,
        });
      } catch {
        // User canceled or unsupported
      }
    } else {
      handleCopy();
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl border-t border-border/50 p-6 glass">
        <SheetHeader className="text-left space-y-1 mb-4">
          <SheetTitle className="text-base font-bold">Share Wishlist</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Anyone with this link can view items and reserve gifts anonymously.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              value={url}
              readOnly
              className="bg-card/60 text-xs rounded-xl border-border/50 select-all"
            />
            <Button
              onClick={handleCopy}
              size="icon"
              className="shrink-0 rounded-xl gradient-primary text-white"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button
              onClick={handleWhatsApp}
              variant="outline"
              className="w-full gap-2 rounded-xl text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
            >
              <MessageCircle className="w-4 h-4" />
              <span>WhatsApp</span>
            </Button>

            <Button
              onClick={handleNativeShare}
              variant="outline"
              className="w-full gap-2 rounded-xl text-xs font-semibold bg-primary/10 hover:bg-primary/20 text-primary border-primary/30"
            >
              <Share2 className="w-4 h-4" />
              <span>More Options</span>
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
