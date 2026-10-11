import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ruler, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { upsertStyleProfile } from '@/lib/api';
import type { StyleProfile } from '@/types/database';

const garmentCategories = [
  ['tops', 'Tops (shirts, knitwear, hoodies)'],
  ['bottoms', 'Bottoms (trousers, jeans, shorts, skirts)'],
  ['outerwear', 'Jackets and coats'],
  ['dresses', 'Dresses'],
  ['sportswear', 'Sportswear and activewear'],
  ['underwear', 'Underwear and swimwear'],
] as const;
const commonSizes = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL'];
type Entry = { actual: string; preferred: string; fit: string; system: string; alternatives: string };
type Entries = Record<string, Entry>;
const emptyEntry = (): Entry => ({ actual: '', preferred: '', fit: 'regular', system: 'International', alternatives: '' });
const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const initialEntry = (source: unknown): Entry => {
  const value = record(source);
  return { ...emptyEntry(), actual: String(value.actual ?? ''), preferred: String(value.preferred ?? ''), fit: String(value.fit ?? 'regular'), system: String(value.system ?? 'International'), alternatives: Array.isArray(value.alternatives) ? value.alternatives.join(', ') : '' };
};

export function MySizes({ userId, profile }: { userId: string; profile: StyleProfile | null }) {
  const queryClient = useQueryClient();
  const [context, setContext] = useState('unspecified');
  const [apparel, setApparel] = useState<Entries>({});
  const [shoe, setShoe] = useState<Entry>(emptyEntry());
  const [width, setWidth] = useState('standard');
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const [brandSizesText, setBrandSizesText] = useState('');
  const [accessorySizesText, setAccessorySizesText] = useState('');
  const [expanded, setExpanded] = useState('tops');

  useEffect(() => {
    if (!profile) return;
    const saved = record(profile.apparel_sizes);
    const next: Entries = {};
    for (const [key] of garmentCategories) next[key] = initialEntry(saved[key] ?? record(profile.clothing_sizes)[key === 'tops' ? 'top' : key === 'bottoms' ? 'bottom' : key]);
    setContext(profile.sizing_context || 'unspecified');
    setApparel(next);
    const savedShoe = record(profile.shoe_sizes);
    const preferred = record(savedShoe.preferred);
    const actual = record(savedShoe.actual);
    setShoe({
      ...emptyEntry(), actual: String(actual.value ?? profile.shoe_size ?? ''), system: String(actual.system ?? preferred.system ?? 'EU'),
      preferred: String(preferred.value ?? ''), fit: String(savedShoe.fit ?? 'regular'), alternatives: Array.isArray(savedShoe.alternatives) ? savedShoe.alternatives.join(', ') : '',
    });
    setWidth(String(savedShoe.width ?? 'standard'));
    const savedMeasurements = record(profile.measurements);
    setMeasurements(Object.fromEntries(Object.entries(savedMeasurements).map(([key, value]) => [key, String(value ?? '')])));
    const savedBrands = record(profile.brand_sizes);
    setBrandSizesText(Object.entries(savedBrands).flatMap(([brand, entries]) => Object.entries(record(entries)).map(([category, size]) => `${brand} | ${category} | ${size}`)).join('\n'));
    setAccessorySizesText(Object.entries(record(profile.accessory_sizes)).map(([category, size]) => `${category}: ${size}`).join('\n'));
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const apparelSizes = Object.fromEntries(Object.entries(apparel).map(([key, entry]) => [key, {
        actual: entry.actual.trim() || null, preferred: entry.preferred.trim() || null, fit: entry.fit, system: entry.system,
        alternatives: entry.alternatives.split(',').map((part) => part.trim()).filter(Boolean),
      }]));
      const shoeSizes = {
        actual: { value: shoe.actual.trim() || null, system: shoe.system },
        preferred: { value: shoe.preferred.trim() || null, system: shoe.system },
        alternatives: shoe.alternatives.split(',').map((part) => part.trim()).filter(Boolean),
        fit: shoe.fit, width,
      };
      const measurementsClean: Record<string, number> = {};
      Object.entries(measurements).forEach(([key, value]) => {
        const measured = Number(value);
        if (value.trim() && Number.isFinite(measured) && measured > 0) measurementsClean[key] = measured;
      });
      const brandSizes: Record<string, Record<string, string>> = {};
      brandSizesText.split('\n').forEach((line) => {
        const [brand, category, size] = line.split('|').map((part) => part.trim());
        if (brand && category && size) (brandSizes[brand] ||= {})[category] = size;
      });
      const accessorySizes = Object.fromEntries(accessorySizesText.split('\n').map((line) => line.split(':').map((part) => part.trim())).filter((parts) => parts.length >= 2 && parts[0] && parts[1]).map(([category, size]) => [category.toLowerCase(), size]));
      const saved = await upsertStyleProfile(userId, {
        sizing_context: context as StyleProfile['sizing_context'], apparel_sizes: apparelSizes, shoe_sizes: shoeSizes,
        measurements: measurementsClean, fit_preferences: Object.fromEntries(Object.entries(apparelSizes).map(([key, value]) => [key, value.fit])),
        brand_sizes: brandSizes, accessory_sizes: accessorySizes,
        clothing_sizes: Object.fromEntries(Object.entries(apparelSizes).map(([key, value]) => [key, value.preferred || value.actual || null])),
        shoe_size: shoe.preferred || shoe.actual || null,
      });
      if (!saved) throw new Error('Could not save size preferences.');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['style-profile', userId] });
      toast.success('Size profile saved');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not save size profile'),
  });

  const updateEntry = (key: string, field: keyof Entry, value: string) => setApparel((current) => ({ ...current, [key]: { ...emptyEntry(), ...current[key], [field]: value } }));
  const inputClass = 'h-9 rounded-xl text-xs bg-card/60';

  return (
    <Card className="rounded-3xl glass-card border border-border/50">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2"><Ruler className="h-4 w-4 text-primary" /><div><h3 className="text-sm font-semibold">My Sizes</h3><p className="text-[10px] text-muted-foreground">Private to your account. Add only what helps your recommendations.</p></div></div>
        <div className="space-y-1.5"><Label className="text-xs">Sizing context</Label><Select value={context} onValueChange={setContext}><SelectTrigger className={inputClass}><SelectValue /></SelectTrigger><SelectContent>
          <SelectItem value="mens">Men’s sizing</SelectItem><SelectItem value="womens">Women’s sizing</SelectItem><SelectItem value="unisex_mixed">Unisex or mixed shopping</SelectItem><SelectItem value="unspecified">Prefer not to specify</SelectItem>
        </SelectContent></Select><p className="text-[10px] text-muted-foreground">This guides size charts and does not limit products you can browse.</p></div>

        <div className="space-y-2">{garmentCategories.map(([key, label]) => {
          const entry = apparel[key] || emptyEntry();
          const open = expanded === key;
          return <section key={key} className="rounded-xl border border-border/40 bg-card/30">
            <button type="button" className="flex w-full items-center justify-between p-3 text-left text-xs font-semibold" aria-expanded={open} onClick={() => setExpanded(open ? '' : key)}>{label}<span className="text-muted-foreground">{open ? '−' : '+'}</span></button>
            {open && <div className="grid grid-cols-2 gap-2 px-3 pb-3">
              <div className="space-y-1"><Label className="text-[10px]">Actual size</Label><Input value={entry.actual} onChange={(event) => updateEntry(key, 'actual', event.target.value)} placeholder="e.g. M, EU 40, 38" className={inputClass} /></div>
              <div className="space-y-1"><Label className="text-[10px]">Preferred size</Label><Input value={entry.preferred} onChange={(event) => updateEntry(key, 'preferred', event.target.value)} placeholder="Usually selected" className={inputClass} /></div>
              <div className="space-y-1"><Label className="text-[10px]">Sizing system</Label><Select value={entry.system} onValueChange={(value) => updateEntry(key, 'system', value)}><SelectTrigger className={inputClass}><SelectValue /></SelectTrigger><SelectContent>{['International', 'EU', 'US', 'UK', 'FR', 'IT', 'Numeric', 'Brand chart'].map((system) => <SelectItem key={system} value={system}>{system}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1"><Label className="text-[10px]">Preferred fit</Label><Select value={entry.fit} onValueChange={(value) => updateEntry(key, 'fit', value)}><SelectTrigger className={inputClass}><SelectValue /></SelectTrigger><SelectContent>{['slim', 'fitted', 'regular', 'relaxed', 'oversized'].map((fit) => <SelectItem key={fit} value={fit}>{fit}</SelectItem>)}</SelectContent></Select></div>
              <div className="col-span-2 space-y-1"><Label className="text-[10px]">Alternative sizes you will consider</Label><Input value={entry.alternatives} onChange={(event) => updateEntry(key, 'alternatives', event.target.value)} placeholder="Comma separated, e.g. S, L" className={inputClass} /></div>
              <div className="col-span-2 flex flex-wrap gap-1">{commonSizes.map((size) => <button key={size} type="button" onClick={() => updateEntry(key, 'preferred', size)} className="rounded-md border border-border/50 px-2 py-1 text-[9px] text-muted-foreground hover:text-foreground">{size}</button>)}</div>
            </div>}
          </section>;
        })}</div>

        <section className="space-y-3 rounded-xl border border-border/40 p-3">
          <h4 className="text-xs font-semibold">Footwear</h4><div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label className="text-[10px]">Actual size</Label><Input value={shoe.actual} onChange={(event) => setShoe({ ...shoe, actual: event.target.value })} placeholder="e.g. 40 or 7.5" className={inputClass} /></div>
            <div className="space-y-1"><Label className="text-[10px]">Preferred size</Label><Input value={shoe.preferred} onChange={(event) => setShoe({ ...shoe, preferred: event.target.value })} placeholder="Usually selected" className={inputClass} /></div>
            <div className="space-y-1"><Label className="text-[10px]">Sizing system</Label><Select value={shoe.system} onValueChange={(value) => setShoe({ ...shoe, system: value })}><SelectTrigger className={inputClass}><SelectValue /></SelectTrigger><SelectContent>{['EU', 'US men', 'US women', 'UK', 'CM', 'MM'].map((system) => <SelectItem key={system} value={system}>{system}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label className="text-[10px]">Width</Label><Select value={width} onValueChange={setWidth}><SelectTrigger className={inputClass}><SelectValue /></SelectTrigger><SelectContent>{['standard', 'narrow', 'wide', 'extra-wide'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
            <div className="col-span-2 space-y-1"><Label className="text-[10px]">Alternative sizes</Label><Input value={shoe.alternatives} onChange={(event) => setShoe({ ...shoe, alternatives: event.target.value })} placeholder="Comma separated" className={inputClass} /></div>
          </div>
        </section>

        <section className="space-y-2 rounded-xl border border-border/40 p-3"><h4 className="text-xs font-semibold">Optional measurements (cm)</h4><div className="grid grid-cols-2 gap-2">{[['chest', 'Chest'], ['bust', 'Bust'], ['waist', 'Waist'], ['hips', 'Hips'], ['inseam', 'Inseam'], ['foot_length', 'Foot length']].map(([key, label]) => <div key={key} className="space-y-1"><Label className="text-[10px]">{label}</Label><Input inputMode="decimal" type="number" min="0" value={measurements[key] || ''} onChange={(event) => setMeasurements({ ...measurements, [key]: event.target.value })} className={inputClass} /></div>)}</div><p className="text-[10px] text-muted-foreground">Measurements are optional and never inferred from images.</p></section>

        <details className="rounded-xl border border-border/40 p-3"><summary className="cursor-pointer text-xs font-semibold">Brand and accessory sizes</summary><div className="mt-3 space-y-2"><div className="space-y-1"><Label className="text-[10px]">Brand-specific sizes (one per line: brand | category | size)</Label><textarea value={brandSizesText} onChange={(event) => setBrandSizesText(event.target.value)} placeholder="Nike | tops | M" className="min-h-16 w-full rounded-xl border border-input bg-card/60 p-2 text-xs" /></div><div className="space-y-1"><Label className="text-[10px]">Belts, hats, rings, gloves, socks (category: size)</Label><textarea value={accessorySizesText} onChange={(event) => setAccessorySizesText(event.target.value)} placeholder="belt: 85 cm&#10;hat: 58 cm" className="min-h-16 w-full rounded-xl border border-input bg-card/60 p-2 text-xs" /></div></div></details>

        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full rounded-xl"><Save className="mr-2 h-4 w-4" />{saveMutation.isPending ? 'Saving…' : 'Save size profile'}</Button>
      </CardContent>
    </Card>
  );
}
