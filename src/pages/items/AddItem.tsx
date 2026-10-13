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
import { CURRENCIES, isSupportedCurrency, type Currency } from '@/lib/currency';
import { normalizeProductCondition, type ProductCondition } from '@/lib/productCondition';
import { getWishlists } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { FashionImageSearchPanel } from '@/components/shared/FashionImageSearchPanel';
import { mergeFashionCandidateDetails } from '@/lib/fashionImage';
import {
  importByNameSearch,
  importFromBarcode,
  importFromUrl,
  isValidGtin,
  saveImportedProductToWishlist,
} from '@/lib/importService';
import { discoverOffersForProduct } from '@/lib/providers';
import type { FetchedProduct, ProductCandidate, FetchedOffer } from '@/types/database';

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
  const [condition, setCondition] = useState<ProductCondition>('unknown');
  const [variantDetails, setVariantDetails] = useState<{ color?: string; size?: string; capacity?: string; sku?: string }>({});
  const [availableVariants, setAvailableVariants] = useState<NonNullable<FetchedProduct['variants']>>([]);
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
  const [discoveredOffers, setDiscoveredOffers] = useState<FetchedOffer[]>([]);
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
    const selectedFashionDetails = mergeFashionCandidateDetails(
      { category, brand, description },
      { brand: candidate.brand, description: candidate.description },
    );
    setPrice('');
    setPriceSource('user_entered');
    setOriginalPrice('');
    setTitle(candidate.title);
    setBrand(selectedFashionDetails.brand);
    setModel(candidate.model_number || '');
    setGtin(candidate.gtin || '');
    setProductVerified(Boolean(candidate.gtin && isValidGtin(candidate.gtin.replace(/\D/g, "")) && candidate.confidence >= 0.99));
    setImageUrl(candidate.image_url || '');
    setAdditionalImages([]);
    setDescription(selectedFashionDetails.description);
    setCategory(selectedFashionDetails.category);
    setVariant('');
    setCondition(normalizeProductCondition(candidate.condition || candidate.title));
    setVariantDetails({});
    setAvailableVariants([]);
    setProductUrl(candidate.url || productUrl);
    setStore(candidate.store || store);
    const candidateCurrency = candidate.currency?.toUpperCase();
    const candidateCurrencySupported = isSupportedCurrency(candidateCurrency);
    if (candidate.gtin && candidate.confidence >= 0.99 && candidate.price && candidate.price > 0 && candidateCurrencySupported) {
      setPrice(String(candidate.price));
      setPriceSource('barcode_catalog');
    }
    if (candidateCurrencySupported) setCurrency(candidateCurrency);
    setCandidates([]);
    discoverOffersForProduct({
      title: candidate.title,
      brand: selectedFashionDetails.brand,
      model_number: candidate.model_number,
      gtin: candidate.gtin,
    }).then((offers) => setDiscoveredOffers(offers)).catch(() => {});
    if (candidate.price && !candidateCurrencySupported) toast.info('Product selected. Its price has no supported currency, so the price was left blank.');
    else toast.success('Product selected. Wishly discovered matching offers across Moroccan and global stores.');
  };

  const selectImportedVariant = (selected: NonNullable<FetchedProduct['variants']>[number]) => {
    setVariant(selected.name);
    setVariantDetails({
      ...(selected.color ? { color: selected.color } : {}),
      ...(selected.size ? { size: selected.size } : {}),
      ...(selected.capacity ? { capacity: selected.capacity } : {}),
      ...(selected.sku ? { sku: selected.sku } : {}),
    });
    setGtin(selected.gtin || '');
    setProductVerified(Boolean(selected.gtin && isValidGtin(selected.gtin.replace(/\D/g, ''))));
    setPrice(selected.price && selected.price > 0 ? String(selected.price) : '');
    setPriceSource(selected.price && selected.price > 0 ? 'retailer_page' : 'user_entered');
    setOriginalPrice('');
    if (selected.image_url) setImageUrl(selected.image_url);
  };

  const handleUrlImport = async () => {
    setBusy(true);
    setCandidates([]);
    setDiscoveredOffers([]);
    setTitle(''); setBrand(''); setModel(''); setGtin(''); setVariant(''); setVariantDetails({}); setAvailableVariants([]);
    setCondition('unknown');
    setImageUrl(''); setAdditionalImages([]); setDescription(''); setCategory('');
    setPrice(''); setPriceSource('retailer_page'); setStore(''); setProductVerified(false);
    setOriginalPrice('');
    try {
      const result = await importFromUrl(urlInput.trim());
      const pageCurrency = result.product.currency.toUpperCase();
      const pageCurrencySupported = isSupportedCurrency(pageCurrency);
      setTitle(result.product.title);
      setPriceSource(result.product.price && result.product.price > 0 && pageCurrencySupported ? 'retailer_page' : 'user_entered');
      setCandidates(result.candidates);
      setDiscoveredOffers(result.offers || []);
      setBrand(result.product.brand || '');
      setModel(result.product.model_number || '');
      setGtin(result.product.gtin || '');
      setProductVerified(Boolean(result.product.gtin && isValidGtin(result.product.gtin.replace(/\D/g, ""))));
      setImageUrl(result.product.image_url || '');
      setAdditionalImages(result.product.additional_images || []);
      setDescription(result.product.description || '');
      setCategory(result.product.category || '');
      setVariant(result.product.variant_name || '');
      setCondition(normalizeProductCondition(result.product.condition));
      setVariantDetails(result.product.variant_details || {});
      const importedVariants = result.product.variants || [];
      setAvailableVariants(pageCurrencySupported ? importedVariants : importedVariants.map((option) => ({ ...option, price: undefined })));
      setProductUrl(result.product.canonical_url || urlInput.trim());
      setStore(result.product.store || '');
      if (result.product.price && result.product.price > 0 && pageCurrencySupported) {
        setPrice(String(result.product.price));
        setPriceSource('retailer_page');
      }
      setOriginalPrice(pageCurrencySupported && result.product.original_price ? String(result.product.original_price) : '');
      if (pageCurrencySupported) setCurrency(pageCurrency);
      const notices = [
        result.message,
        result.product.price && !pageCurrencySupported
          ? result.product.currency
            ? 'The page price uses a currency Wishly does not support yet, so it was left blank.'
            : 'The page did not identify the price currency, so the price was left blank.'
          : null,
      ].filter(Boolean);
      if (notices.length) toast.info(notices.join(' '));
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
      const saved = await saveImportedProductToWishlist({
        wishlistId, title: title.trim(), imageUrl: imageUrl || null, additionalImages,
        url: productUrl || urlInput || null, store: store || null,
        price: price ? Number(price) : null, originalPrice: originalPrice ? Number(originalPrice) : null, currency, brand: brand || null,
        modelNumber: model || null, gtin: gtin || null, variantName: variant || null,
        priority, notes: notes || null, targetPrice: targetPrice ? Number(targetPrice) : null,
        isVerified: productVerified, priceSource,
        description: description || null, category: category || null,
        variantDetails,
        condition,
        offers: discoveredOffers,
      });
      return saved;
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['wishlist-detail', wishlistId] });
      queryClient.invalidateQueries({ queryKey: ['discover-personalized', profile?.id] });
      if (saved.isDuplicate) toast.info('This product is already in this wishlist. The existing item was kept.');
      else toast.success('Product saved. Wishly will show available matches from configured sources.');
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

          {mode === 'image' && <FashionImageSearchPanel
            onCandidates={setCandidates}
            onSelectedItem={(selectedItem) => {
              setCategory(selectedItem.category);
              setBrand(selectedItem.brand);
              setDescription(selectedItem.description);
            }}
          />}

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
                <div className="space-y-1.5">
                  <Label>Variant</Label>
                  <Input value={variant} onChange={(e) => setVariant(e.target.value)} placeholder="Color, capacity, size, bundle" />
                  {availableVariants.length > 0 && <div className="space-y-2 rounded-xl border border-border/60 p-3">
                    <p className="text-xs text-muted-foreground">Variants listed on this product page. Select the one you want to track.</p>
                    <div className="flex flex-wrap gap-2">
                      {availableVariants.map((option, index) => {
                        const details = [option.color, option.size, option.capacity].filter(Boolean).join(' · ');
                        const label = details && !option.name.toLowerCase().includes(details.toLowerCase()) ? `${option.name} · ${details}` : option.name;
                        return <button type="button" key={`${option.sku || option.gtin || option.name}-${index}`} onClick={() => selectImportedVariant(option)} className={`rounded-lg border px-3 py-2 text-left text-xs ${variant === option.name ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
                          <span className="block">{label}</span>
                          {option.price != null && <span className="mt-1 block font-medium">{option.price} {currency}</span>}
                        </button>;
                      })}
                    </div>
                  </div>}
                </div>
                <div className="space-y-1.5">
                  <Label>Product condition</Label>
                  <Select value={condition} onValueChange={(value) => setCondition(value as ProductCondition)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="refurbished">Refurbished</SelectItem>
                      <SelectItem value="open_box">Open box</SelectItem>
                      <SelectItem value="used">Used</SelectItem>
                      <SelectItem value="unknown">Unknown / not stated</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Offers in a different or unknown condition will not count as an exact deal.</p>
                </div>
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

                {discoveredOffers.length > 0 && (
                  <div className="space-y-2 rounded-xl border border-purple-500/30 bg-purple-500/5 p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <span>⚡ Matching Store Offers ({discoveredOffers.length})</span>
                      </span>
                      <span className="text-[10px] text-muted-foreground font-medium">Moroccan 🇲🇦 & Global 🌐</span>
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pt-1">
                      {discoveredOffers.map((o, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-card/70 border border-border/40 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm shrink-0">{o.store.includes('Maroc') || o.currency === 'MAD' ? '🇲🇦' : '🌐'}</span>
                            <div className="min-w-0">
                              <span className="font-semibold text-foreground block truncate">{o.store}</span>
                              {o.delivery_estimate && <span className="block text-[10px] text-muted-foreground">{o.delivery_estimate}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {o.price > 0 && <span className="font-bold text-emerald-400">{o.price} {o.currency}</span>}
                            <a href={o.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-[11px] font-medium">View ↗</a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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
