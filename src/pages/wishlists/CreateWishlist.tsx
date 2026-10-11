import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock, Users, Globe, Calendar as CalendarIcon, Loader2 } from 'lucide-react';
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
import { createWishlist } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { slugify } from '@/lib/utils';
import type { Privacy } from '@/types/database';
import { toast } from 'sonner';

export default function CreateWishlist() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const [name, setName] = useState('');
  const [occasion, setOccasion] = useState('birthday');
  const [eventDate, setEventDate] = useState('');
  const [privacy, setPrivacy] = useState<Privacy>('public');
  const [coverUrl, setCoverUrl] = useState('');

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Not authenticated');
      const slug = slugify(name) || `list-${Date.now()}`;
      return createWishlist({
        owner_id: profile.id,
        name,
        slug,
        occasion,
        event_date: eventDate || null,
        privacy,
        cover_url: coverUrl || null,
        position: 0,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['my-wishlists'] });
      toast.success('Wishlist created!');
      if (data) {
        navigate(`/wishlists/${data.id}`);
      } else {
        navigate('/wishlists');
      }
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to create wishlist');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Please enter a wishlist name');
      return;
    }
    createMutation.mutate();
  };

  return (
    <AppShell>
      <div className="min-h-screen pb-24">
        <Header showBack title="Create Wishlist" />

        <div className="p-4 sm:p-6 max-w-lg mx-auto">
          <Card className="rounded-3xl glass-card border border-border/50 p-2">
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4 pt-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Wishlist Name</Label>
                  <Input
                    type="text"
                    placeholder="e.g. My 26th Birthday in Casablanca"
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
                    <Label className="text-xs font-semibold">Event Date (optional)</Label>
                    <Input
                      type="date"
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      className="h-10 rounded-xl bg-card/60 text-xs border-border/50"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Cover Image URL (optional)</Label>
                  <Input
                    type="url"
                    placeholder="https://images.unsplash.com/..."
                    value={coverUrl}
                    onChange={(e) => setCoverUrl(e.target.value)}
                    className="h-10 rounded-xl bg-card/60 text-xs border-border/50"
                  />
                </div>

                {/* Privacy Selector */}
                <div className="space-y-2 pt-1">
                  <Label className="text-xs font-semibold">Who can see this list?</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'public', label: 'Public', icon: Globe, desc: 'Anyone with link' },
                      { id: 'friends', label: 'Friends', icon: Users, desc: 'Accepted friends' },
                      { id: 'private', label: 'Private', icon: Lock, desc: 'Only you' },
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
                              : 'bg-card/40 border-border/50 text-muted-foreground hover:border-border'
                          }`}
                        >
                          <Icon className="w-4 h-4 mb-1" />
                          <span className="text-xs font-bold leading-tight">{p.label}</span>
                          <span className="text-[10px] opacity-75 mt-0.5">{p.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-3">
                  <Button
                    type="submit"
                    disabled={createMutation.isPending}
                    className="w-full h-11 rounded-xl gradient-primary text-white font-semibold text-xs shadow-lg shadow-purple-500/20"
                  >
                    {createMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <span>Create Wishlist</span>
                    )}
                  </Button>
                </div>
              </CardContent>
            </form>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
