import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Check, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/contexts/I18nContext';

interface UpgradeDialogProps {
  feature?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function UpgradeDialog({
  feature = 'Premium features',
  isOpen,
  onClose,
}: UpgradeDialogProps) {
  const navigate = useNavigate();
  const { t } = useI18n();

  const handleUpgrade = () => {
    onClose();
    navigate('/premium');
  };

  const perks = [
    t.premium.features.unlimitedLists,
    t.premium.features.unlimitedTracking,
    t.premium.features.unlimitedAi,
    t.premium.features.fullHistory,
    t.premium.features.earlyAlerts,
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xs sm:max-w-sm rounded-3xl p-6 glass border border-purple-500/30">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center text-white mx-auto shadow-lg shadow-amber-500/20 mb-2">
          <Crown className="w-6 h-6" />
        </div>

        <DialogHeader className="text-center space-y-1.5">
          <DialogTitle className="text-lg font-bold">
            Unlock {feature}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            You've hit the limit on the Free tier. Upgrade to Wishly Premium to continue.
          </DialogDescription>
        </DialogHeader>

        <div className="my-4 space-y-2 py-2 border-y border-border/40">
          {perks.map((perk, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-foreground">
              <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <Check className="w-2.5 h-2.5 stroke-[3]" />
              </div>
              <span>{perk}</span>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <Button
            onClick={handleUpgrade}
            className="w-full gradient-primary text-white font-semibold text-xs py-2.5 rounded-xl shadow-lg shadow-purple-500/20"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            Upgrade from $4.99 / mo
          </Button>
          <Button
            variant="ghost"
            onClick={onClose}
            className="w-full text-xs text-muted-foreground hover:text-foreground"
          >
            Maybe later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
