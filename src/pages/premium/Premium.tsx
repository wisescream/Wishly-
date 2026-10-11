import React, { useState } from 'react';
import { Crown, Check, Sparkles, Shield, Zap } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { PREMIUM_PLANS } from '@/lib/constants';
import { toast } from 'sonner';

export default function Premium() {
  const { profile } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('annual');

  const comparisonRows = [
    { feature: 'Wishlists', free: '5 lists max', premium: 'Unlimited lists' },
    { feature: 'Price Tracking', free: '10 items', premium: 'Unlimited items' },
    { feature: 'Price History', free: '30 days', premium: 'Full 1-Year history' },
    { feature: 'AI Shopping Assistant', free: '10 msgs / day', premium: 'Unlimited AI advice' },
    { feature: 'Early Price Drop Alerts', free: '—', premium: 'Instant push & realtime' },
    { feature: 'Custom Style Profiling', free: 'Basic sizes', premium: 'Full sizing & brands' },
    { feature: 'Priority Support', free: '—', premium: '24/7 dedicated' },
  ];

  const handleSubscribe = () => {
    toast.info('Payment checkout will be activated with Stripe/CMI Morocco in the next release.');
  };

  return (
    <AppShell>
      <div className="min-h-screen pb-24">
        <Header showBack title="Wishly Premium" />

        <div className="p-4 sm:p-6 max-w-xl mx-auto space-y-6">
          {/* Hero Banner */}
          <div className="text-center space-y-3 pt-2">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center text-white mx-auto shadow-2xl shadow-amber-500/25">
              <Crown className="w-8 h-8" />
            </div>

            <div>
              <h1 className="text-2xl font-black text-foreground">
                Upgrade to Premium
              </h1>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                Get expanded wishlist tools and more room for shopping-assistant conversations.
              </p>
            </div>
          </div>

          {/* Pricing Selector Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div
              onClick={() => setSelectedPlan('monthly')}
              className={`p-4 rounded-3xl border cursor-pointer transition-all ${
                selectedPlan === 'monthly'
                  ? 'border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/10'
                  : 'glass-card border-border/50 hover:border-border'
              }`}
            >
              <span className="text-xs font-bold text-foreground block">Monthly</span>
              <div className="my-2">
                <span className="text-2xl font-black text-foreground">$4.99</span>
                <span className="text-[10px] text-muted-foreground"> /mo</span>
              </div>
              <span className="text-[10px] text-muted-foreground block">
                ≈ 49 MAD billed monthly
              </span>
            </div>

            <div
              onClick={() => setSelectedPlan('annual')}
              className={`relative p-4 rounded-3xl border cursor-pointer transition-all ${
                selectedPlan === 'annual'
                  ? 'border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/10'
                  : 'glass-card border-border/50 hover:border-border'
              }`}
            >
              <Badge className="absolute -top-2.5 right-3 text-[9px] gradient-primary text-white font-bold px-2 py-0.5">
                Save 33%
              </Badge>
              <span className="text-xs font-bold text-foreground block">Annual</span>
              <div className="my-2">
                <span className="text-2xl font-black text-foreground">$7.99</span>
                <span className="text-[10px] text-muted-foreground"> /mo</span>
              </div>
              <span className="text-[10px] text-muted-foreground block">
                Billed annually ($95.88)
              </span>
            </div>
          </div>

          {/* Subscribe CTA */}
          <Button
            onClick={handleSubscribe}
            className="w-full h-12 rounded-2xl gradient-primary text-white font-bold text-sm shadow-xl shadow-purple-500/25 touch-feedback"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            <span>Start 14-Day Free Trial</span>
          </Button>

          {/* Comparison Table */}
          <Card className="rounded-3xl glass-card border border-border/50 overflow-hidden">
            <div className="p-4 border-b border-border/40">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Free vs Premium Comparison
              </h3>
            </div>
            <div className="divide-y divide-border/30 text-xs">
              {comparisonRows.map((row, i) => (
                <div key={i} className="grid grid-cols-3 p-3 items-center">
                  <span className="font-semibold text-foreground">{row.feature}</span>
                  <span className="text-muted-foreground text-center">{row.free}</span>
                  <span className="text-primary font-bold text-right">{row.premium}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
