import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Barcode, ImagePlus, Link2, Loader2, Search, Sparkles } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PRIORITIES } from '@/lib/constants';
import { CURRENCIES, type Currency } from '@/lib/currency';
import { getWishlists } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  importByNameSearch,
  importFromBarcode,
  importFromImage,
  importFromUrl,
  isValidGtin,
  saveImportedProductToWishlist,
} from '@/lib/importService';
import type { ProductCandidate } from '@/types/database';

type ImportMode = 'url' | 'search' | 'image' | 'barcode' | 'manual';
const modes: Array<{ id: ImportMode; label: string; icon: React.ElementType }> = [
  { id: 'url', label: 'Paste a link', icon: Link2 },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'image', label: 'Upload image', icon: ImagePlus },
  { id: 'barcode', label: 'Barcode', icon: Barcode },
  { id: 'manual', label: 'Enter details', icon: Sparkles },
];

type DetectorWindow = Window & {
  BarcodeDetector?: new (options?: { formats?: string[] }) => {
    detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
  };
};

export default function AddItem() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const initialSearchQuery = searchParams.get('search') || '';
  const preselectedListId = searchParams.get('list');
  const [mode, setMode] = useState<ImportMode>(initialSearchQuery ? 'search' : 'url');
  const [wishlistId, setWishlistId] = useState(preselectedListId || '');
  const [title, setTitle] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [gtin, setGtin] = useState('');
  const [productVerified, setProductVerified] = useState(false);
  const [variant, setVariant] = useState('');
  const [variantDetails, setVariantDetails] = useState<{ color?: string; size?: string; capacity?: string; sku?: string }>({});
  const [imageUrl, setImageUrl] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [additionalImages, setAdditionalImages] = useState<string[]>([]);
  const [productUrl, setProductUrl] = useState('');
  const [store, setStore] = useState('');
  const [price, setPrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [priceSource, setPriceSource] = useState('user_entered');
  const [currency, setCurrency] = useState<Currency>('MAD');
  const [priority, setPriority] = useState<number>(2);
  const [notes, setNotes] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [searchInput, setSearchInput] = useState(initialSearchQuery);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [candidates, setCandidates] = useState<ProductCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [scanActive, setScanActive] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [ocrText, setOcrText] = useState('');
  const [observedPrice, setObservedPrice] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const autoSearchRef = useRef<string | null>(null);

  const { data: wishlists = [] } = useQuery({
    queryKey: ['my-wishlists', profile?.id],
    queryFn: () => (profile?.id ? getWishlists(profile.id) : Promise.resolve([])),
    enabled: !!profile?.id,
  });

  useEffect(() => {
    if (!wishlistId && wishlists.length) setWishlistId(wishlists[0].id);
  }, [wishlists, wishlistId]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    if (!scanActive) return;
    const Detector = (window as DetectorWindow).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      toast.error('Camera barcode scanning is not supported here. Enter the barcode manually.');
      setScanActive(false);
      return;
    }
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let cancelled = false;
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
        if (cancelled || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const detector = new Detector({ formats: ['ean_8', 'ean_13', 'upc_a', 'upc_e', 'upc_ean'] });
        timer = window.setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const found = await detector.detect(videoRef.current);
            if (found[0]?.rawValue) {
              setBarcodeInput(found[0].rawValue);
              setScanActive(false);
              stream?.getTracks().forEach((track) => track.stop());
              toast.success('Barcode captured. Look it up to confirm the product.');
            }
          } catch { /* Continue scanning frames */ }
        }, 650);
      } catch {
        toast.error('Camera access failed. Enter the barcode manually.');
        setScanActive(false);
      }
    };
    void start();
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [scanActive]);

  const fillFromCandidate = async (candidate: ProductCandidate) => {
    setTitle(candidate.title);
    setBrand(candidate.brand || '');
    setModel(candidate.model_number || '');
    setGtin(candidate.gtin || '');
    setProductVerified(Boolean(candidate.gtin && isValidGtin(candidate.gtin.replace(/\D/g, "")) && candidate.confidence >= 0.99));
    setImageUrl(candidate.image_url || '');
    setAdditionalImages([]);
    setDescription(candidate.description || '');
    setCategory('');
    setVariant('');
    setVariantDetails({});
    setProductUrl(candidate.url || productUrl);
    setStore(candidate.store || store);
    if (candidate.gtin && candidate.confidence >= 0.99 && candidate.price && candidate.price > 0) {
      setPrice(String(candidate.price));
      setPriceSource('barcode_catalog');
    }
    if (candidate.currency && Object.prototype.hasOwnProperty.call(CURRENCIES, candidate.currency)) setCurrency(candidate.currency as Currency);
    setCandidates([]);
    toast.success('Product selected. Wishly will search configured offer sources after you save it.');
  };

  const handleUrlImport = async () => {
    setBusy(true);
    setTitle(''); setBrand(''); setModel(''); setGtin(''); setVariant(''); setVariantDetails({});
    setImageUrl(''); setAdditionalImages([]); setDescription(''); setCategory('');
    setPrice(''); setPriceSource('retailer_page'); setStore(''); setProductVerified(false);
    setOriginalPrice('');
    try {
      const result = await importFromUrl(urlInput.trim());
      setTitle(result.product.title);
      setBrand(result.product.brand || '');
      setModel(result.product.model_number || '');
      setGtin(result.product.gtin || '');
      setProductVerified(Boolean(result.product.gtin && isValidGtin(result.product.gtin.replace(/\D/g, ""))));
      setImageUrl(result.product.image_url || '');
      setAdditionalImages(result.product.additional_images || []);
      setDescription(result.product.description || '');
      setCategory(result.product.category || '');
      setVariant(result.product.variant_name || '');
      setVariantDetails(result.product.variant_details || {});
      setProductUrl(urlInput.trim());
      setStore(result.product.store || '');
      if (result.product.price && result.product.price > 0 && result.product.currency) {
        setPrice(String(result.product.price));
        setPriceSource('retailer_page');
      }
      setOriginalPrice(result.product.original_price ? String(result.product.original_price) : '');
      if (Object.prototype.hasOwnProperty.call(CURRENCIES, result.product.currency)) setCurrency(result.product.currency as Currency);
      if (result.message) toast.info(result.message);
      else toast.success('Product details imported. Review them below; offer discovery will continue after saving.');
    } catch (error) {
      setProductUrl(urlInput.trim());
      toast.error(error instanceof Error ? error.message : 'Could not read this product page. Enter details manually.');
      setMode('manual');
    } finally { setBusy(false); }
  };

  const handleSearch = useCallback(async (query = searchInput) => {
    setBusy(true);
    setCandidates([]);
    try {
      const found = await importByNameSearch(query);
      setCandidates(found);
      if (!found.length) toast.info('No product candidates found. Add details manually or configure the shopping search provider.');
    } catch { toast.error('Product search is unavailable. You can still add the product manually.'); }
    finally { setBusy(false); }
  }, [searchInput]);

  useEffect(() => {
    const query = searchParams.get('search')?.trim();
    if (!query || autoSearchRef.current === query) return;
    autoSearchRef.current = query;
    setMode('search');
    setSearchInput(query);
    void handleSearch(query);
  }, [handleSearch, searchParams]);

  const handleImage = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setTitle(''); setBrand(''); setModel(''); setGtin(''); setVariant(''); setVariantDetails({});
    setImageUrl(''); setAdditionalImages([]); setDescription(''); setCategory('');
    setPrice(''); setPriceSource('user_entered'); setStore(''); setProductVerified(false);
    setOriginalPrice('');
    try {
      const result = await importFromImage(file);
      setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return result.previewUrl; });
      setOcrText(result.detectedText);
      setObservedPrice(result.observedPrice);
      if (result.observedPrice) {
        setPrice(String(result.observedPrice));
        setPriceSource('image_ocr');
        if (Object.prototype.hasOwnProperty.call(CURRENCIES, result.observedCurrency)) setCurrency(result.observedCurrency as Currency);
      }
      if (result.detectedText) setSearchInput(result.detectedText.slice(0, 200));
      setCandidates(result.candidates);
      if (!result.detectedText) toast.info('Image loaded. OCR is unavailable in this browser; search by name or enter details manually.');
      else if (!result.candidates.length) toast.info('Text was read from the image. Select Search to find product candidates.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not read that image.'); }
    finally { setBusy(false); }
  };

  const handleBarcodeLookup = async (value = barcodeInput) => {
    setBusy(true);
    try {
      const result = await importFromBarcode(value);
      if (!result.candidate) {
        toast.info(result.error || 'No product found for this barcode.');
        return;
      }
      await fillFromCandidate(result.candidate);
    } catch { toast.error('Barcode lookup failed. You can enter the product manually.'); }
    finally { setBusy(false); }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!wishlistId) throw new Error('Please select a wishlist');
      if (!title.trim()) throw new Error('Product name is required');
      const itemId = await saveImportedProductToWishlist({
        wishlistId, title: title.trim(), imageUrl: imageUrl || null, additionalImages,
        url: productUrl || urlInput || null, store: store || null,
        price: price ? Number(price) : null, originalPrice: originalPrice ? Number(originalPrice) : null, currency, brand: brand || null,
        modelNumber: model || null, gtin: gtin || null, variantName: variant || null,
        priority, notes: notes || null, targetPrice: targetPrice ? Number(targetPrice) : null,
        isVerified: productVerified, priceSource,
        description: description || null, category: category || null,
        variantDetails,
      });
      // Fire-and-forget monitoring so wishlist persistence is immediate.
      void supabase.functions.invoke('refresh-offers', { body: { item_id: itemId } })
        .then(() => queryClient.invalidateQueries({ queryKey: ['item-detail', itemId] }))
        .catch(() => undefined);
      return itemId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlist-detail', wishlistId] });
      queryClient.invalidateQueries({ queryKey: ['discover-personalized', profile?.id] });
      toast.success('Product saved. Wishly will show available matches from configured sources.');
      navigate(`/wishlists/${wishlistId}`);
    },
    onError: (err: Error) => toast.error(err.message || 'Could not save product'),
  });

  return (
    <AppShell>
      <div className="min-h-screen pb-24">
        <Header showBack title="Add Product" />
        <main className="p-4 sm:p-6 max-w-2xl mx-auto space-y-4">
          <section aria-label="Product import methods" className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {modes.map(({ id, label, icon: Icon }) => (
              <Button key={id} type="button" variant={mode === id ? 'default' : 'outline'}
                onClick={() => setMode(id)} className="rounded-xl h-auto min-h-11 px-2 py-2 text-xs gap-1.5">
                <Icon className="w-4 h-4 shrink-0" />{label}
              </Button>
            ))}
          </section>

          {mode === 'url' && <section className="p-4 rounded-2xl border border-purple-500/30 bg-purple-500/5 space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-400" />Import a product page</h2>
            <p className="text-xs text-muted-foreground">Wishly reads product metadata when a site allows it. Review the extracted fields below; missing details remain editable.</p>
            <div className="flex gap-2"><Input type="url" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="https://retailer.com/product" />
              <Button type="button" onClick={handleUrlImport} disabled={busy || !urlInput.trim()}>{busy ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Reading page</> : 'Import'}</Button></div>
          </section>}

          {mode === 'search' && <section className="p-4 rounded-2xl border border-border space-y-3">
            <h2 className="text-sm font-semibold">Search products</h2>
            <div className="flex gap-2"><Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void handleSearch(); }} placeholder="Brand, product name and model" />
              <Button type="button" onClick={() => void handleSearch()} disabled={busy || !searchInput.trim()}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}</Button></div>
          </section>}

          {mode === 'image' && <section className="p-4 rounded-2xl border border-border space-y-3">
            <h2 className="text-sm font-semibold">Upload a product photo or shopping screenshot</h2>
            <p className="text-xs text-muted-foreground">Wishly reads text in browsers that support it and sends an optimized copy to Google Lens through SerpAPI for visual matches. Matches are candidates to confirm, not verified offers.</p>
            <Input type="file" accept="image/*" onChange={(e) => void handleImage(e.target.files?.[0])} disabled={busy} />
            {previewUrl && <img src={previewUrl} alt="Uploaded product reference" className="max-h-52 rounded-xl object-contain" />}
            {busy && <p className="text-xs text-muted-foreground" role="status">Reading visible text and searching visual product matches…</p>}
            {ocrText && <p className="text-xs text-muted-foreground">Read from image: {ocrText}</p>}
            {observedPrice && <p className="text-xs text-amber-600">Image price observation: {observedPrice} {currency}. Unverified; confirm it before relying on it.</p>}
            {ocrText && <Button type="button" variant="outline" disabled={busy} onClick={() => { setMode('search'); void handleSearch(ocrText.slice(0, 200)); }}>Search using extracted text</Button>}
          </section>}

          {mode === 'barcode' && <section className="p-4 rounded-2xl border border-border space-y-3">
            <h2 className="text-sm font-semibold">Find a product by barcode</h2>
            <p className="text-xs text-muted-foreground">Enter an EAN, UPC, or GTIN, or scan with a compatible camera.</p>
            <div className="flex gap-2"><Input inputMode="numeric" value={barcodeInput} onChange={(e) => setBarcodeInput(e.target.value)} placeholder="8, 12, 13, or 14 digits" />
              <Button type="button" onClick={() => void handleBarcodeLookup()} disabled={busy || !barcodeInput.trim()}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Look up'}</Button></div>
            <Button type="button" variant="outline" onClick={() => setScanActive((active) => !active)}>{scanActive ? 'Stop camera' : 'Scan barcode with camera'}</Button>
            {scanActive && <video ref={videoRef} muted playsInline className="w-full max-h-64 rounded-xl bg-black" />}
          </section>}

          {candidates.length > 0 && <section className="space-y-2" aria-live="polite">
            <h2 className="text-sm font-semibold">Choose the matching product</h2>
            <p className="text-xs text-muted-foreground">Search results are candidates. Confirm the brand, model, and variant before saving.</p>
            {candidates.map((candidate, index) => <button key={`${candidate.source}-${candidate.gtin || candidate.model_number || candidate.title}-${index}`}
              type="button" onClick={() => void fillFromCandidate(candidate)} className="w-full text-left p-3 rounded-xl border border-border hover:border-primary flex gap-3 items-center">
              {candidate.image_url ? <img src={candidate.image_url} alt="" className="w-14 h-14 rounded-lg object-cover" /> : <div className="w-14 h-14 rounded-lg bg-muted" />}
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium truncate">{candidate.title}</span>
                <span className="block text-xs text-muted-foreground">{[candidate.brand, candidate.model_number, candidate.store].filter(Boolean).join(' · ')}</span>
                <span className="block text-[11px] text-muted-foreground">{candidate.match_reason || `Source: ${candidate.source}`}</span></span>
              {candidate.price && <span className="text-xs whitespace-nowrap">{candidate.price} {candidate.currency}</span>}
            </button>)}
          </section>}

          <Card className="rounded-2xl border border-border/60">
            <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }}>
              <CardContent className="space-y-4 pt-5">
                <div className="space-y-1.5"><Label>Wishlist</Label><Select value={wishlistId} onValueChange={setWishlistId}><SelectTrigger><SelectValue placeholder="Choose a wishlist" /></SelectTrigger><SelectContent>{wishlists.map((list) => <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label>Product name</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Name and model" /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Category</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Optional" /></div>
                  <div className="space-y-1.5"><Label>Image gallery URLs</Label><Input value={additionalImages.join(', ')} onChange={(e) => setAdditionalImages(e.target.value.split(',').map((value) => value.trim()).filter(Boolean).slice(0, 6))} placeholder="Optional, comma separated" /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Brand</Label><Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Brand" /></div>
                  <div className="space-y-1.5"><Label>Model number</Label><Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Manufacturer model" /></div>
                </div>
                <div className="space-y-1.5"><Label>EAN / UPC / GTIN (optional)</Label><Input inputMode="numeric" value={gtin} onChange={(e) => { setGtin(e.target.value); setProductVerified(false); }} placeholder="Barcode identifier" /></div>
                <div className="space-y-1.5"><Label>Variant</Label><Input value={variant} onChange={(e) => setVariant(e.target.value)} placeholder="Color, capacity, size, bundle" /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Starting price (optional)</Label><Input type="number" min="0" step="any" value={price} onChange={(e) => { setPrice(e.target.value); setPriceSource('user_entered'); }} placeholder="Not a live offer" /></div>
                  <div className="space-y-1.5"><Label>Currency</Label><Select value={currency} onValueChange={(value) => setCurrency(value as Currency)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.values(CURRENCIES).map((item) => <SelectItem key={item.code} value={item.code}>{item.flag} {item.code}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div className="space-y-1.5"><Label>Original listed price (optional)</Label><Input type="number" min="0" step="any" value={originalPrice} onChange={(e) => setOriginalPrice(e.target.value)} placeholder="If shown by the retailer" /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Retailer</Label><Input value={store} onChange={(e) => setStore(e.target.value)} placeholder="Optional" /></div>
                  <div className="space-y-1.5"><Label>Target price alert</Label><Input type="number" min="0" step="any" value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} placeholder="Optional" /></div>
                </div>
                <div className="space-y-1.5"><Label>Product or source image URL</Label><Input type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." /></div>
                <div className="space-y-1.5"><Label>Product description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Imported product details, editable before saving" /></div>
                <div className="space-y-1.5"><Label>Source product URL</Label><Input type="url" value={productUrl} onChange={(e) => setProductUrl(e.target.value)} placeholder="Optional" /></div>
                <div className="space-y-1.5"><Label>Priority</Label><div className="grid grid-cols-3 gap-2">{PRIORITIES.map((item) => <button type="button" key={item.value} onClick={() => setPriority(item.value)} className={`p-2 rounded-xl border text-xs ${priority === item.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>{item.emoji} {item.label}</button>)}</div></div>
                <div className="space-y-1.5"><Label>Notes and preferences</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Size, color, condition, or other details" /></div>
                <Button type="submit" disabled={createMutation.isPending || !wishlists.length} className="w-full h-11 rounded-xl">{createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Save to wishlist</Button>
                {price && <p className="text-xs text-muted-foreground">This starting price is stored as an observation. Only fresh exact-match offers appear in retailer comparison.</p>}
              </CardContent>
            </form>
          </Card>
        </main>
      </div>
    </AppShell>
  );
}
