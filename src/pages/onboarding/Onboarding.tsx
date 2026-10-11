import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ONBOARDING_SLIDES, COUNTRIES, STYLE_TAGS } from '@/lib/constants';
import { CURRENCIES, type Currency } from '@/lib/currency';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { updateProfile, upsertStyleProfile } from '@/lib/api';

export default function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currency, setCurrency } = useCurrency();
  const [slideIndex, setSlideIndex] = useState(0);

  // Profile preferences state
  const [country, setCountry] = useState('MA');
  const [clothingSize, setClothingSize] = useState('M');
  const [shoeSize, setShoeSize] = useState('40');
  const [selectedTags, setSelectedTags] = useState<string[]>(['Casual', 'Chic']);

  const isLastSlide = slideIndex >= ONBOARDING_SLIDES.length;

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleFinish = async () => {
    if (user) {
      await updateProfile(user.id, {
        country,
        currency,
      });

      await upsertStyleProfile(user.id, {
        clothing_sizes: { top: clothingSize, bottom: clothingSize },
        shoe_size: shoeSize,
        style_tags: selectedTags,
      });
    }
    navigate('/home');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between p-6 max-w-md mx-auto">
      {/* Top Header */}
      <div className="flex justify-between items-center pt-2">
        <span className="font-extrabold text-sm gradient-text">Wishly</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleFinish}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Skip
        </Button>
      </div>

      {/* Main Slide Content */}
      <div className="my-auto py-8">
        {!isLastSlide ? (
          <div className="flex flex-col items-center text-center space-y-6">
            <div
              className={`w-28 h-28 rounded-3xl bg-gradient-to-tr ${ONBOARDING_SLIDES[slideIndex].gradient} flex items-center justify-center text-5xl shadow-2xl shadow-purple-500/20`}
            >
              {ONBOARDING_SLIDES[slideIndex].emoji}
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-foreground">
                {ONBOARDING_SLIDES[slideIndex].title}
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
                {ONBOARDING_SLIDES[slideIndex].description}
              </p>
            </div>
          </div>
        ) : (
          /* Style & Region Setup Step */
          <div className="space-y-6">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center text-2xl mx-auto mb-2">
                ✨
              </div>
              <h2 className="text-xl font-bold">Personalize your Wishly</h2>
              <p className="text-xs text-muted-foreground">
                Choose your country and currency to personalize product details and price display
              </p>
            </div>

            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Country</Label>
                  <Select value={country} onValueChange={setCountry}>
                    <SelectTrigger className="rounded-xl text-xs bg-card/60">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((c) => (
                        <SelectItem key={c.code} value={c.code} className="text-xs">
                          {c.flag} {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Currency</Label>
                  <Select value={currency} onValueChange={(val) => setCurrency(val as Currency)}>
                    <SelectTrigger className="rounded-xl text-xs bg-card/60">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(CURRENCIES).map((c) => (
                        <SelectItem key={c.code} value={c.code} className="text-xs">
                          {c.flag} {c.code} ({c.symbol})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Clothing Size</Label>
                  <Select value={clothingSize} onValueChange={setClothingSize}>
                    <SelectTrigger className="rounded-xl text-xs bg-card/60">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['XS', 'S', 'M', 'L', 'XL', 'XXL'].map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Shoe Size (EU)</Label>
                  <Select value={shoeSize} onValueChange={setShoeSize}>
                    <SelectTrigger className="rounded-xl text-xs bg-card/60">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'].map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Style tags */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Favorite Styles</Label>
                <div className="flex flex-wrap gap-1.5">
                  {STYLE_TAGS.map((tag) => {
                    const active = selectedTags.includes(tag);
                    return (
                      <button
                        type="button"
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${
                          active
                            ? 'bg-primary text-white border-primary shadow-sm'
                            : 'bg-card/60 text-muted-foreground border-border/50 hover:border-border'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Slide Navigation Dots and Buttons */}
      <div className="space-y-4 pb-4">
        {!isLastSlide ? (
          <>
            <div className="flex justify-center gap-1.5 mb-6">
              {ONBOARDING_SLIDES.map((_, i) => (
                <span
                  key={i}
                  className={`w-2 h-2 rounded-full transition-all ${
                    slideIndex === i ? 'w-6 bg-primary' : 'bg-muted'
                  }`}
                />
              ))}
              <span
                className={`w-2 h-2 rounded-full transition-all ${
                  isLastSlide ? 'w-6 bg-primary' : 'bg-muted'
                }`}
              />
            </div>

            <Button
              onClick={() => setSlideIndex((i) => i + 1)}
              className="w-full h-12 rounded-2xl gradient-primary text-white font-bold text-sm shadow-xl shadow-purple-500/20"
            >
              <span>Continue</span>
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </>
        ) : (
          <Button
            onClick={handleFinish}
            className="w-full h-12 rounded-2xl gradient-primary text-white font-bold text-sm shadow-xl shadow-purple-500/20"
          >
            <span>Start Shopping & Wishing</span>
            <Check className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  );
}
