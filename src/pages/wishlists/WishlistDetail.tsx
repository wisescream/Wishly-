import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Share2,
  MoreVertical,
  Plus,
  LayoutGrid,
  List as ListIcon,
  Trash2,
  Edit,
  ExternalLink,
  Calendar,
  Lock,
  Users,
  Globe,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ItemCard } from '@/components/shared/ItemCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { SkeletonCard } from '@/components/shared/SkeletonCard';
import { ShareSheet } from '@/components/shared/ShareSheet';
import { PrivacyBadge } from '@/components/shared/PrivacyBadge';
import {
  getWishlistWithItems,
  deleteWishlist,
  reserveItem,
  unreserveItem,
} from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { OCCASIONS } from '@/lib/constants';
import { generateShareUrl } from '@/lib/utils';
import { toast } from 'sonner';

export default function WishlistDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { format } = useCurrency();

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterPriority, setFilterPriority] = useState<number | null>(null);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const { data: wishlist, isLoading } = useQuery({
    queryKey: ['wishlist-detail', id],
    queryFn: () => (id ? getWishlistWithItems(id) : Promise.resolve(null)),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteWishlist(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-wishlists'] });
      toast.success('Wishlist deleted');
      navigate('/wishlists');
    },
    onError: () => toast.error('Failed to delete wishlist'),
  });

  if (isLoading) {
    return (
      <AppShell>
        <Header showBack title="Loading wishlist..." />
        <div className="p-4 space-y-4 max-w-4xl mx-auto">
          <SkeletonCard mode="list-card" className="h-44" />
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <SkeletonCard key={i} mode="item-grid" />
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  if (!wishlist) {
    return (
      <AppShell>
        <Header showBack title="Wishlist not found" />
        <div className="p-6 text-center">
          <EmptyState
            emoji="🔍"
            title="Wishlist not found"
            description="This wishlist may have been deleted or is set to private."
            action={{ label: 'Go to my lists', onClick: () => navigate('/wishlists') }}
          />
        </div>
      </AppShell>
    );
  }

  const isOwner = profile?.id === wishlist.owner_id;
  const occasionMeta = OCCASIONS.find((o) => o.value === wishlist.occasion);
  const gradientClass = occasionMeta?.gradient || 'from-violet-600 to-pink-500';

  const items = wishlist.items || [];
  const filteredItems = filterPriority
    ? items.filter((item) => item.priority === filterPriority)
    : items;

  const totalValue = items.reduce((acc, curr) => acc + (curr.current_price || 0), 0);
  const shareUrl = generateShareUrl(
    wishlist.owner?.username
      ? `${wishlist.owner.username}/${wishlist.slug}`
      : wishlist.slug
  );

  return (
    <AppShell>
      <div className="min-h-screen pb-24">
        {/* Header */}
        <Header
          showBack
          title={wishlist.name}
          actions={
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsShareOpen(true)}
                className="w-8 h-8 rounded-full"
              >
                <Share2 className="w-4 h-4" />
              </Button>

              {isOwner && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-2xl glass">
                    <DropdownMenuItem
                      onClick={() => navigate(`/wishlists/${wishlist.id}/edit`)}
                      className="text-xs cursor-pointer gap-2"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>Edit List</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setIsDeleteOpen(true)}
                      className="text-xs cursor-pointer text-destructive focus:text-destructive gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete List</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          }
        />

        <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
          {/* Cover & Meta Hero */}
          <div
            className={`relative rounded-3xl overflow-hidden bg-gradient-to-tr ${gradientClass} p-5 sm:p-6 text-white shadow-xl shadow-purple-500/10 min-h-[160px] flex flex-col justify-between`}
          >
            {wishlist.cover_url && (
              <img
                src={wishlist.cover_url}
                alt={wishlist.name}
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-black/25 backdrop-blur-[1px]" />

            <div className="relative z-10 flex justify-between items-start">
              <PrivacyBadge privacy={wishlist.privacy} />
              {occasionMeta && (
                <span className="text-3xl drop-shadow-md">
                  {occasionMeta.emoji}
                </span>
              )}
            </div>

            <div className="relative z-10 space-y-1 mt-6">
              <h1 className="text-2xl font-extrabold tracking-tight drop-shadow-sm">
                {wishlist.name}
              </h1>

              <div className="flex flex-wrap items-center gap-3 text-xs text-white/90">
                <span>{items.length} items</span>
                <span>•</span>
                <span>Total: {format(totalValue, 'MAD')}</span>
                {wishlist.event_date && (
                  <>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(wishlist.event_date).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Controls Bar: View mode & Priority filter */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              <Button
                variant={filterPriority === null ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setFilterPriority(null)}
                className="rounded-xl h-8 px-2.5 text-xs"
              >
                All
              </Button>
              {[1, 2, 3].map((p) => (
                <Button
                  key={p}
                  variant={filterPriority === p ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setFilterPriority(filterPriority === p ? null : p)}
                  className="rounded-xl h-8 px-2 text-xs"
                >
                  {p === 3 ? '🔥 Must have' : p === 2 ? '💜 Really want' : '💭 Nice to have'}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-1 bg-card/60 border border-border/50 rounded-xl p-0.5 shrink-0">
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setViewMode('grid')}
                className="w-7 h-7 rounded-lg"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setViewMode('list')}
                className="w-7 h-7 rounded-lg"
              >
                <ListIcon className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Items Display */}
          {filteredItems.length > 0 ? (
            <div
              className={
                viewMode === 'grid'
                  ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5'
                  : 'space-y-2.5'
              }
            >
              {filteredItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  mode={viewMode}
                  onReserve={
                    !isOwner
                      ? async (itemId) => {
                          if (!profile) {
                            toast.error('Please sign in to reserve gifts');
                            navigate('/auth/login');
                            return;
                          }
                          await reserveItem(itemId, profile.id);
                          toast.success('Reserved! The owner cannot see who reserved it.');
                          queryClient.invalidateQueries({ queryKey: ['wishlist-detail', id] });
                        }
                      : undefined
                  }
                />
              ))}
            </div>
          ) : (
            <EmptyState
              emoji="🎁"
              title="No items in this wishlist yet"
              description="Add products from stores around the world. Wishly will search connected sources for matching offers."
              action={
                isOwner
                  ? {
                      label: 'Add an Item',
                      onClick: () => navigate(`/items/add?list=${wishlist.id}`),
                    }
                  : undefined
              }
            />
          )}

          {/* Sticky Mobile Add Item Action */}
          {isOwner && items.length > 0 && (
            <div className="fixed bottom-20 right-4 sm:hidden z-30">
              <Button
                onClick={() => navigate(`/items/add?list=${wishlist.id}`)}
                className="h-12 px-4 rounded-full gradient-primary text-white font-semibold text-xs shadow-xl shadow-purple-500/30 flex items-center gap-2"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>Add Item</span>
              </Button>
            </div>
          )}
        </div>

        {/* Share Sheet Modal */}
        <ShareSheet
          url={shareUrl}
          title={wishlist.name}
          isOpen={isShareOpen}
          onClose={() => setIsShareOpen(false)}
        />

        {/* Delete Confirmation Alert */}
        <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <AlertDialogContent className="rounded-3xl glass border-border/50 max-w-xs">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-base font-bold">
                Delete "{wishlist.name}"?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-muted-foreground">
                This will permanently delete this wishlist and all its tracked items.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="grid grid-cols-2 gap-2 mt-4">
              <AlertDialogCancel className="rounded-xl text-xs">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteMutation.mutate()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl text-xs font-semibold"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppShell>
  );
}
