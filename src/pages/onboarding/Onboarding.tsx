import React, { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MySizes } from '@/components/profile/MySizes';
import { ONBOARDING_SLIDES, COUNTRIES } from '@/lib/constants';
import { CURRENCIES, type Currency } from '@/lib/currency';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { getStyleProfile, updateProfile } from '@/lib/api';
import { toast } from 'sonner';

export default function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currency, setCurrency } = useCurrency();
  const [slideIndex, setSlideIndex] = useState(0);
  const [country, setCountry] = useState('MA');
  const [saving, setSaving] = useState(false);
  const saveSizesRef = useRef<(() => Promise<void>) | null>(null);
  const registerSizeSave = useCallback((save: () => Promise<void>) => {
    saveSizesRef.current = save;
  }, []);
  const { data: styleProfile, isLoading: isStyleProfileLoading } = useQuery({
    queryKey: ['style-profile', user?.id],
    queryFn: () => user?.id ? getStyleProfile(user.id) : Promise.resolve(null),
    enabled: !!user?.id,
  });

  const isLastSlide = slideIndex >= ONBOARDING_SLIDES.length;

  const handleFinish = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (user) {
        if (isLastSlide && isStyleProfileLoading) throw new Error('Your My Sizes profile is still loading. Please wait a moment and try again.');
        const updatedProfile = await updateProfile(user.id, { country, currency });
        if (!updatedProfile) throw new Error('Could not save your country and currency. Please try again.');
        if (isLastSlide && saveSizesRef.current) await saveSizesRef.current();
      }
      navigate('/home');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save your onboarding settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen overflow-y-auto bg-background flex flex-col justify-between p-6 max-w-md mx-auto">
      <div className="flex justify-between items-center pt-2">
        <span className="font-extrabold text-sm gradient-text">Wishly</span>
        <Button variant="ghost" size="sm" onClick={handleFinish} disabled={saving} className="text-xs text-muted-foreground hover:text-foreground">
          Skip
        </Button>
      </div>

      <div className="my-auto py-8">
        {!isLastSlide ? (
          <div className="flex flex-col items-center text-center space-y-6">
            <div className={`w-28 h-28 rounded-3xl bg-gradient-to-tr ${ONBOARDING_SLIDES[slideIndex].gradient} flex items-center justify-center text-5xl shadow-2xl shadow-purple-500/20`}>
              {ONBOARDING_SLIDES[slideIndex].emoji}
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-foreground">{ONBOARDING_SLIDES[slideIndex].title}</h2>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">{ONBOARDING_SLIDES[slideIndex].description}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center text-2xl mx-auto mb-2">✨</div>
              <h2 className="text-xl font-bold">Personalize your Wishly</h2>
              <p className="text-xs text-muted-foreground">Set your shopping region and add the sizes you want Wishly to use.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Country</Label>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger className="rounded-xl text-xs bg-card/60"><SelectValue /></SelectTrigger>
                  <SelectContent>{COUNTRIES.map((item) => <SelectItem key={item.code} value={item.code} className="text-xs">{item.flag} {item.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Currency</Label>
                <Select value={currency} onValueChange={(value) => setCurrency(value as Currency)}>
                  <SelectTrigger className="rounded-xl text-xs bg-card/60"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.values(CURRENCIES).map((item) => <SelectItem key={item.code} value={item.code} className="text-xs">{item.flag} {item.code} ({item.symbol})</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {user?.id && (isStyleProfileLoading
              ? <div className="flex items-center justify-center gap-2 rounded-2xl border border-border/50 p-6 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading your saved sizes…</div>
              : <MySizes userId={user.id} profile={styleProfile ?? null} showSaveButton={false} onRegisterSave={registerSizeSave} />)}
          </div>
        )}
      </div>

      <div className="space-y-4 pb-4">
        {!isLastSlide ? (
          <>
            <div className="flex justify-center gap-1.5 mb-6">
              {ONBOARDING_SLIDES.map((_, index) => <span key={index} className={`w-2 h-2 rounded-full transition-all ${slideIndex === index ? 'w-6 bg-primary' : 'bg-muted'}`} />)}
              <span className="w-6 h-2 rounded-full bg-muted" />
            </div>
            <Button onClick={() => setSlideIndex((index) => index + 1)} className="w-full h-12 rounded-2xl gradient-primary text-white font-bold text-sm shadow-xl shadow-purple-500/20">
              <span>Continue</span><ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </>
        ) : (
          <Button onClick={handleFinish} disabled={saving || (!!user?.id && isStyleProfileLoading)} className="w-full h-12 rounded-2xl gradient-primary text-white font-bold text-sm shadow-xl shadow-purple-500/20">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : <><span>Save My Sizes & Start Shopping</span><Check className="w-4 h-4 ml-2" /></>}
          </Button>
        )}
      </div>
    </div>
  );
}
