import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Lock, Users, Globe, Trash2 } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { OCCASIONS } from '@/lib/constants';
import { getWishlistWithItems, updateWishlist, deleteWishlist } from '@/lib/api';
import type { Privacy } from '@/types/database';
import { toast } from 'sonner';

export default function EditWishlist() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [occasion, setOccasion] = useState('birthday');
  const [eventDate, setEventDate] = useState('');
  const [privacy, setPrivacy] = useState<Privacy>('public');
  const [coverUrl, setCoverUrl] = useState('');

  const { data: wishlist, isLoading } = useQuery({
    queryKey: ['wishlist-edit', id],
    queryFn: () => (id ? getWishlistWithItems(id) : Promise.resolve(null)),
    enabled: !!id,
  });

  useEffect(() => {
    if (wishlist) {
      setName(wishlist.name || '');
      setOccasion(wishlist.occasion || 'birthday');
      setEventDate(wishlist.event_date ? wishlist.event_date.split('T')[0] : '');
      setPrivacy(wishlist.privacy || 'public');
      setCoverUrl(wishlist.cover_url || '');
    }
  }, [wishlist]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!id) return;
      return updateWishlist(id, {
        name,
        occasion,
        event_date: eventDate || null,
        privacy,
        cover_url: coverUrl || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlist-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['my-wishlists'] });
      toast.success('Wishlist updated!');
      navigate(`/wishlists/${id}`);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to update wishlist');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteWishlist(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-wishlists'] });
      toast.success('Wishlist deleted');
      navigate('/wishlists');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Please enter a name');
      return;
    }
    updateMutation.mutate();
  };

  return (
    <AppShell>
      <div className="min-h-screen pb-24">
        <Header showBack title="Edit Wishlist" />

        <div className="p-4 sm:p-6 max-w-lg mx-auto">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <Card className="rounded-3xl glass-card border border-border/50 p-2">
              <form onSubmit={handleSubmit}>
                <CardContent className="space-y-4 pt-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Wishlist Name</Label>
                    <Input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="h-10 rounded-xl bg-card/60 text-xs border-border/50"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Occasion</Label>
                      <Select value={occasion} onValueChange={setOccasion}>
                        <SelectTrigger className="h-10 rounded-xl bg-card/60 text-xs border-border/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {OCCASIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value} className="text-xs">
                              {o.emoji} {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Event Date</Label>
                      <Input
                        type="date"
                        value={eventDate}
                        onChange={(e) => setEventDate(e.target.value)}
                        className="h-10 rounded-xl bg-card/60 text-xs border-border/50"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Cover Image URL</Label>
                    <Input
                      type="url"
                      value={coverUrl}
                      onChange={(e) => setCoverUrl(e.target.value)}
                      className="h-10 rounded-xl bg-card/60 text-xs border-border/50"
                    />
                  </div>

                  {/* Privacy Selector */}
                  <div className="space-y-2 pt-1">
                    <Label className="text-xs font-semibold">Privacy</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'public', label: 'Public', icon: Globe },
                        { id: 'friends', label: 'Friends', icon: Users },
                        { id: 'private', label: 'Private', icon: Lock },
                      ].map((p) => {
                        const Icon = p.icon;
                        const active = privacy === p.id;
                        return (
                          <button
                            type="button"
                            key={p.id}
                            onClick={() => setPrivacy(p.id as Privacy)}
                            className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all ${
                              active
                                ? 'bg-primary/10 border-primary text-primary shadow-sm'
                                : 'bg-card/40 border-border/50 text-muted-foreground'
                            }`}
                          >
                            <Icon className="w-4 h-4 mb-1" />
                            <span className="text-xs font-bold">{p.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-3 space-y-2">
                    <Button
                      type="submit"
                      disabled={updateMutation.isPending}
                      className="w-full h-11 rounded-xl gradient-primary text-white font-semibold text-xs shadow-lg shadow-purple-500/20"
                    >
                      {updateMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <span>Save Changes</span>
                      )}
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        if (confirm('Delete this wishlist permanently?')) {
                          deleteMutation.mutate();
                        }
                      }}
                      className="w-full h-10 rounded-xl text-destructive hover:bg-destructive/10 text-xs font-semibold"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                      <span>Delete Wishlist</span>
                    </Button>
                  </div>
                </CardContent>
              </form>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}
