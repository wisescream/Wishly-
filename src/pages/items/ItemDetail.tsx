import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ExternalLink,
  Gift,
  Bell,
  Trash2,
  CheckCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PriorityBadge } from '@/components/shared/PriorityBadge';
import { PriceChart } from '@/components/shared/PriceChart';
import { StoreComparisonTable } from '@/components/shared/StoreComparisonTable';
import { getItem, updateItem, deleteItem, reserveItem, unreserveItem, getStyleProfile, getFunctionError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { type Currency, formatPrice } from '@/lib/currency';
import { formatProductCondition } from '@/lib/productCondition';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

export default function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const [alertEnabled, setAlertEnabled] = useState(false);
  const [targetPrice, setTargetPrice] = useState('');
  const [dropPercent, setDropPercent] = useState('');
  const [alertOnAnyLower, setAlertOnAnyLower] = useState(false);
  const [alertOnNewRetailer, setAlertOnNewRetailer] = useState(false);
  const [alertOnBackInStock, setAlertOnBackInStock] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const { data: item, isLoading, isError: itemLoadFailed, refetch: retryLoadItem } = useQuery({
    queryKey: ['item-detail', id],
    queryFn: () => (id ? getItem(id) : Promise.resolve(null)),
    enabled: !!id,
    refetchInterval: (query) => ['processing', 'identified', 'searching_offers'].includes(query.state.data?.enrichment_status || '') ? 30_000 : false,
  });
  const { data: styleProfile } = useQuery({
    queryKey: ['style-profile', profile?.id],
    queryFn: () => (profile?.id ? getStyleProfile(profile.id) : Promise.resolve(null)),
    enabled: !!profile?.id,
  });

  React.useEffect(() => {
    if (item) {
      setAlertEnabled(item.target_price !== null);
      if (item.target_price) setTargetPrice(String(item.target_price));
      setDropPercent(item.price_drop_percent == null ? '' : String(item.price_drop_percent));
      setAlertOnAnyLower(item.alert_on_any_lower_price);
      setAlertOnNewRetailer(item.alert_on_new_cheaper_offer);
      setAlertOnBackInStock(item.alert_on_back_in_stock);
      setSelectedImage(item.image_url || item.additional_images?.[0] || null);
    }
  }, [item]);

  const isOwner = profile?.id === item?.wishlist?.owner_id;
  const isReserved = item?.status === 'reserved';
  const isPurchased = item?.status === 'purchased';
  const enrichmentMessage: Record<string, string> = {
    processing: 'Product saved; offer search is queued.',
    identified: 'Product identified. Searching configured sources.',
    searching_offers: 'Searching configured retailer sources.',
    offers_available: 'Offers found from configured sources.',
    manual_confirmation: 'Review needed to confirm the exact product.',
    partial: 'Partial results. Some product or offer details could not be verified.',
    no_matches: 'No exact retailer match found in the configured search sources yet.',
    failed: 'Offer search failed. The wishlist item is still saved.',
    manual: 'Manual product details saved. Research needs a reliable model or identifier before it can find exact retailer matches.',
  };

  const displayPricePoints = item?.price_points ?? [];
  const displayOffers = item?.store_offers ?? [];

  const updateMutation = useMutation({
    mutationFn: (updates: any) => updateItem(id!, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-detail', id] });
      toast.success('Item updated');
    },
  });

  const refreshOffersMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('refresh-offers', {
        body: { item_id: id, force_refresh: true },
      });
      if (error) throw await getFunctionError(error, 'Offer search could not reach its providers.');
      if (data?.error && !data?.status) throw new Error(data.error);
      return data as {
        offers_found: number;
        exact_offers_found: number;
        possible_offers_found?: number;
        error?: string | null;
      };
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['item-detail', id] });
      if (result.exact_offers_found > 0) {
        toast.success(`Found ${result.exact_offers_found} verified retailer offer${result.exact_offers_found === 1 ? '' : 's'}.`);
      } else if (result.offers_found > 0) {
        toast.info(`Found ${result.possible_offers_found ?? result.offers_found} possible retailer listing${result.offers_found === 1 ? '' : 's'}. Check the product and price before buying.`);
      } else {
        toast.info(result.error || 'No retailer matches were found. Try again later.');
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Offer search failed. Try again later.'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteItem(id!),
    onSuccess: () => {
      toast.success('Item deleted');
      navigate(-1);
    },
  });

  if (isLoading) {
    return (
      <AppShell>
        <Header showBack title="Loading item..." />
        <div className="p-6 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell>
        <Header showBack title={itemLoadFailed ? "Could not load item" : "Item not found"} />
        <div className="p-6 flex flex-col items-center gap-3 text-center text-xs text-muted-foreground">
          <p>{itemLoadFailed ? "Wishly couldn't load this item's details, price history, or offers. Check your connection and try again." : "This item could not be found."}</p>
          {itemLoadFailed && <Button variant="outline" size="sm" onClick={() => void retryLoadItem()}>Try again</Button>}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="min-h-screen pb-24">
        <Header
          showBack
          title={item.title}
          actions={
            isOwner ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (confirm('Delete this item?')) deleteMutation.mutate();
                }}
                className="w-8 h-8 rounded-full text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            ) : null
          }
        />

        <div className="p-4 sm:p-6 max-w-lg mx-auto space-y-6">
          {itemLoadFailed && <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800" role="status">
            <span>Refresh failed. Showing the last loaded item data.</span>
            <Button variant="outline" size="sm" onClick={() => void retryLoadItem()}>Retry</Button>
          </div>}
          {/* Main Media & Header */}
          <div className="relative aspect-square w-full rounded-3xl overflow-hidden bg-card/60 border border-border/50 shadow-lg">
            {selectedImage ? (
              <img
                src={selectedImage}
                alt={item.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-6xl bg-muted/30">
                🎁
              </div>
            )}

            <div className="absolute top-3 left-3 flex gap-2">
              <PriorityBadge priority={item.priority} size="md" />
            </div>

            {item.store && (
              <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md text-white text-xs px-2.5 py-1 rounded-full font-medium">
                {item.store}
              </div>
            )}

            {isReserved && (
              <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center">
                <Badge className="bg-purple-600 text-white font-bold text-sm px-4 py-1.5 shadow-xl">
                  Reserved for Gift
                </Badge>
              </div>
            )}

            {isPurchased && (
              <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center">
                <Badge className="bg-emerald-600 text-white font-bold text-sm px-4 py-1.5 shadow-xl">
                  Already Purchased
                </Badge>
              </div>
            )}
          </div>
          {!!item.additional_images?.length && <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {[item.image_url, ...item.additional_images].filter((image): image is string => Boolean(image)).map((image) => <button key={image} type="button" onClick={() => setSelectedImage(image)} aria-label="View product image" className={`h-16 w-16 shrink-0 rounded-xl overflow-hidden border ${selectedImage === image ? 'border-primary' : 'border-border'}`}><img src={image} alt="" className="w-full h-full object-cover" /></button>)}
          </div>}

          {/* Title & Pricing */}
          <div className="space-y-2">
            <h1 className="text-xl font-extrabold text-foreground leading-snug">
              {item.title}
            </h1>
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {enrichmentMessage[item.enrichment_status] || 'Product details saved.'}
              {item.offers_last_checked_at && ` Last checked ${new Date(item.offers_last_checked_at).toLocaleString()}.`}
            </p>
            {item.enrichment_error && <p className="text-xs text-amber-700" role="status">{item.enrichment_error}</p>}

            <div className="flex items-baseline gap-2">
              {item.current_price !== null ? (
                <span className="text-2xl font-black text-foreground">
                  {formatPrice(item.current_price, item.currency as Currency)}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Price not set</span>
              )}
            </div>
            {item.original_price != null && item.current_price != null && item.original_price > item.current_price && <p className="text-xs text-muted-foreground"><span className="line-through">{formatPrice(item.original_price, item.currency as Currency)}</span> · {Math.round((1 - item.current_price / item.original_price) * 100)}% off on the original listing</p>}
            {item.current_price !== null && <p className="text-[11px] text-muted-foreground">Starting price from the original listing or your entry; it is not a live retailer offer.</p>}

            {item.notes && (
              <div className="p-3 rounded-2xl bg-card/60 border border-border/40 text-xs text-muted-foreground leading-relaxed mt-2">
                <strong className="text-foreground block mb-0.5">Notes / Sizing:</strong>
                {item.notes}
              </div>
            )}
            {(item.variant_label || item.category) && <p className="text-xs text-muted-foreground">{[item.variant_label, item.category].filter(Boolean).join(' · ')}</p>}
            {isOwner ? <div className="max-w-xs space-y-1.5">
              <Label htmlFor="tracked-condition" className="text-xs">Tracked condition</Label>
              <Select value={item.condition || 'unknown'} onValueChange={(value) => updateMutation.mutate({ condition: value })}>
                <SelectTrigger id="tracked-condition" aria-label="Tracked product condition"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="refurbished">Refurbished</SelectItem>
                  <SelectItem value="open_box">Open box</SelectItem>
                  <SelectItem value="used">Used</SelectItem>
                  <SelectItem value="unknown">Unknown / not stated</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">Only offers in this condition count as exact deals and price alerts.</p>
            </div> : <p className="text-xs text-muted-foreground">Condition: {formatProductCondition(item.condition)}</p>}
            {item.description && <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>}
          </div>

          {/* Action CTAs */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            {item.url && (
              <Button
                asChild
                className="h-11 rounded-2xl gradient-primary text-white font-semibold text-xs shadow-lg shadow-purple-500/20"
              >
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 justify-center">
                  <span>Buy on {item.store || 'Store'}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </Button>
            )}

            {!isOwner ? (
              !isReserved ? (
                <Button
                  onClick={async () => {
                    if (!profile) {
                      toast.error('Sign in to reserve');
                      navigate('/auth/login');
                      return;
                    }
                    await reserveItem(item.id, profile.id);
                    toast.success('Reserved! The owner cannot see your identity.');
                    queryClient.invalidateQueries({ queryKey: ['item-detail', id] });
                  }}
                  className="h-11 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold gap-1.5"
                >
                  <Gift className="w-4 h-4" />
                  <span>Reserve Gift</span>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (profile) await unreserveItem(item.id, profile.id);
                    toast.info('Reservation cancelled');
                    queryClient.invalidateQueries({ queryKey: ['item-detail', id] });
                  }}
                  className="h-11 rounded-2xl text-xs font-semibold border-purple-500/30 text-purple-400"
                >
                  Cancel Reserve
                </Button>
              )
            ) : (
              <Button
                variant={isPurchased ? 'outline' : 'secondary'}
                onClick={() =>
                  updateMutation.mutate({
                    status: isPurchased ? 'wanted' : 'purchased',
                  })
                }
                className="h-11 rounded-2xl text-xs font-semibold gap-1.5"
              >
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>{isPurchased ? 'Mark Wanted' : 'Mark Purchased'}</span>
              </Button>
            )}
          </div>

          {/* Price Drop Tracker Alert */}
          {isOwner && (
            <div className="p-4 rounded-3xl glass-card border border-border/50 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-bold text-foreground">
                    Target item price alert
                  </span>
                </div>
                <Switch
                  checked={alertEnabled}
                  onCheckedChange={(checked) => {
                    setAlertEnabled(checked);
                    if (!checked) updateMutation.mutate({ target_price: null });
                  }}
                />
              </div>

              {alertEnabled && (
                <div className="flex gap-2 pt-1">
                  <Input
                    type="number"
                    placeholder={`Notify when item price is below ${item.currency || 'MAD'}...`}
                    value={targetPrice}
                    onChange={(e) => setTargetPrice(e.target.value)}
                    className="h-9 rounded-xl text-xs bg-card/60"
                  />
                  <Button
                    size="sm"
                    onClick={() =>
                      updateMutation.mutate({
                        target_price: parseFloat(targetPrice) || null,
                      })
                    }
                    className="h-9 px-3 rounded-xl gradient-primary text-white text-xs"
                  >
                    Set
                  </Button>
                </div>
              )}
              <div className="space-y-3 border-t border-border/40 pt-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="block text-xs font-medium">Notify on a percentage drop</span>
                    <span className="text-[10px] text-muted-foreground">Compared with the saved listing price</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input type="number" min="1" max="100" aria-label="Price drop percentage" placeholder="10%" value={dropPercent} onChange={(event) => setDropPercent(event.target.value)} className="h-8 w-20 rounded-lg text-xs" />
                    <Button size="sm" variant="outline" onClick={() => {
                      const parsed = Number.parseInt(dropPercent, 10);
                      if (dropPercent && (!Number.isInteger(parsed) || parsed < 1 || parsed > 100)) {
                        toast.error('Choose a drop threshold from 1% to 100%.');
                        return;
                      }
                      updateMutation.mutate({ price_drop_percent: dropPercent ? parsed : null });
                    }} className="h-8 rounded-lg px-2 text-[10px]">Save</Button>
                  </div>
                </div>
                {[
                  ['Any lower offer', 'Alert for each fresh high-confidence listing below the saved price.', alertOnAnyLower, setAlertOnAnyLower, 'alert_on_any_lower_price'],
                  ['New cheaper retailer', 'Alert when a newly discovered retailer lists it below the saved price.', alertOnNewRetailer, setAlertOnNewRetailer, 'alert_on_new_cheaper_offer'],
                  ['Back in stock', 'Alert after a supported source reports an out-of-stock item in stock again.', alertOnBackInStock, setAlertOnBackInStock, 'alert_on_back_in_stock'],
                ].map(([label, description, checked, setChecked, field]) => (
                  <div key={String(field)} className="flex items-center justify-between gap-3">
                    <div>
                      <span className="block text-xs font-medium">{String(label)}</span>
                      <span className="text-[10px] text-muted-foreground">{String(description)}</span>
                    </div>
                    <Switch checked={Boolean(checked)} onCheckedChange={(value) => {
                      (setChecked as (value: boolean) => void)(value);
                      updateMutation.mutate({ [String(field)]: value });
                    }} />
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground">Alerts appear in Wishly notifications. Email and push delivery are not configured.</p>
              </div>
            </div>
          )}

          {/* Observed price history */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Price History
            </h3>
            <PriceChart
              pricePoints={displayPricePoints as any}
              currency={(profile?.currency as Currency) || (item.currency as Currency) || 'MAD'}
            />
          </div>

          {/* Retailer offers */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Retailer Offers</h3>
              {isOwner && <Button variant="outline" size="sm" onClick={() => refreshOffersMutation.mutate()} disabled={refreshOffersMutation.isPending} className="h-8 rounded-lg text-[10px]">
                {refreshOffersMutation.isPending ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1.5 h-3 w-3" />}
                {refreshOffersMutation.isPending ? 'Searching…' : 'Refresh offers'}
              </Button>}
            </div>
            {item.enrichment_status === 'partial' && <p className="text-[10px] text-amber-700">The search provider returned partial results. Previously discovered offers remain available and may be stale.</p>}
            {item.enrichment_status === 'no_matches' && <p className="text-[10px] text-muted-foreground">No reliable exact matches were found in the configured search source yet.</p>}
            <StoreComparisonTable
              offers={displayOffers as any}
              styleProfile={styleProfile || null}
              category={item.category}
              itemCondition={item.condition}
              currency={(item.currency as Currency) || 'MAD'}
              originalPrice={item.current_price}
              originalCurrency={item.currency as Currency}
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
