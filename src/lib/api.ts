import { supabase } from "./supabase";
import type {
  Profile,
  StyleProfile,
  Wishlist,
  WishlistWithItems,
  Item,
  ItemWithDetails,
  PricePoint,
  StoreOffer,
  Reservation,
  Friendship,
  FriendshipWithProfile,
  Notification,
  FetchedProduct,
  AiMessage,
  AiSuggestion,
  ItemStatus,
  FriendshipStatus,
} from "@/types/database";

// ═══════════════════════════════════════════════════════════════
// PROFILES
// ═══════════════════════════════════════════════════════════════

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  return data;
}

export async function getProfileByUsername(username: string): Promise<Profile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .single();
  return data;
}

export async function updateProfile(
  userId: string,
  updates: Omit<Partial<Profile>, "id" | "created_at">
): Promise<Profile | null> {
  const { data } = await supabase
    .from("profiles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select()
    .single();
  return data;
}

export async function searchProfiles(query: string): Promise<Profile[]> {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
    .limit(20);
  return data ?? [];
}

// ═══════════════════════════════════════════════════════════════
// STYLE PROFILES
// ═══════════════════════════════════════════════════════════════

export async function getStyleProfile(userId: string): Promise<StyleProfile | null> {
  const { data } = await supabase
    .from("style_profiles")
    .select("*")
    .eq("user_id", userId)
    .single();
  return data;
}

export async function upsertStyleProfile(
  userId: string,
  profile: Partial<StyleProfile>
): Promise<StyleProfile | null> {
  const { data } = await supabase
    .from("style_profiles")
    .upsert({
      user_id: userId,
      ...profile,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  return data;
}

// ═══════════════════════════════════════════════════════════════
// WISHLISTS
// ═══════════════════════════════════════════════════════════════

export async function getWishlists(userId: string): Promise<Wishlist[]> {
  const { data } = await supabase
    .from("wishlists")
    .select("*")
    .eq("owner_id", userId)
    .order("position", { ascending: true });
  return data ?? [];
}

export async function getMyWishlistItems(userId: string): Promise<Item[]> {
  const wishlists = await getWishlists(userId);
  const wishlistIds = wishlists.map((wishlist) => wishlist.id);
  if (wishlistIds.length === 0) return [];

  const { data, error } = await supabase
    .from("items")
    .select("*")
    .in("wishlist_id", wishlistIds)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}

export async function getWishlistWithItems(wishlistId: string): Promise<WishlistWithItems | null> {
  const { data: wishlist } = await supabase
    .from("wishlists")
    .select("*")
    .eq("id", wishlistId)
    .single();

  if (!wishlist) return null;

  const { data: items } = await supabase
    .from("items")
    .select("*")
    .eq("wishlist_id", wishlistId)
    .order("position", { ascending: true });

  const { data: owner } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", wishlist.owner_id)
    .single();

  return {
    ...wishlist,
    items: items ?? [],
    owner: owner ?? undefined,
    item_count: items?.length ?? 0,
    total_value: items?.reduce((sum, item) => sum + (item.current_price ?? 0), 0) ?? 0,
  };
}

export async function getPublicWishlist(
  username: string,
  slug: string
): Promise<WishlistWithItems | null> {
  const profile = await getProfileByUsername(username);
  if (!profile) return null;

  const { data: wishlist } = await supabase
    .from("wishlists")
    .select("*")
    .eq("owner_id", profile.id)
    .eq("slug", slug)
    .eq("privacy", "public")
    .single();

  if (!wishlist) return null;

  const { data: items } = await supabase
    .from("items")
    .select("*")
    .eq("wishlist_id", wishlist.id)
    .order("position", { ascending: true });

  return {
    ...wishlist,
    items: items ?? [],
    owner: profile,
    item_count: items?.length ?? 0,
    total_value: items?.reduce((sum, item) => sum + (item.current_price ?? 0), 0) ?? 0,
  };
}

export async function createWishlist(
  wishlist: Omit<Wishlist, "id" | "created_at" | "updated_at">
): Promise<Wishlist | null> {
  const { data } = await supabase
    .from("wishlists")
    .insert(wishlist)
    .select()
    .single();
  return data;
}

export async function updateWishlist(
  id: string,
  updates: Omit<Partial<Wishlist>, "id" | "owner_id" | "created_at">
): Promise<Wishlist | null> {
  const { data } = await supabase
    .from("wishlists")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  return data;
}

export async function deleteWishlist(id: string): Promise<boolean> {
  const { error } = await supabase.from("wishlists").delete().eq("id", id);
  return !error;
}

export async function getPublicWishlists(limit = 20): Promise<WishlistWithItems[]> {
  const { data: wishlists } = await supabase
    .from("wishlists")
    .select("*")
    .eq("privacy", "public")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!wishlists) return [];

  const results: WishlistWithItems[] = [];
  for (const wl of wishlists) {
    const { data: items } = await supabase
      .from("items")
      .select("*")
      .eq("wishlist_id", wl.id)
      .order("position", { ascending: true })
      .limit(4);
    const { data: owner } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", wl.owner_id)
      .single();
    results.push({
      ...wl,
      items: items ?? [],
      owner: owner ?? undefined,
      item_count: items?.length ?? 0,
    });
  }
  return results;
}

export async function getFriendsWishlists(userId: string): Promise<WishlistWithItems[]> {
  // Get friend IDs
  const friendIds = await getFriendIds(userId);
  if (friendIds.length === 0) return [];

  const { data: wishlists } = await supabase
    .from("wishlists")
    .select("*")
    .in("owner_id", friendIds)
    .in("privacy", ["friends", "public"])
    .order("updated_at", { ascending: false })
    .limit(20);

  if (!wishlists) return [];

  const results: WishlistWithItems[] = [];
  for (const wl of wishlists) {
    const { data: items } = await supabase
      .from("items")
      .select("*")
      .eq("wishlist_id", wl.id)
      .limit(4);
    const { data: owner } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", wl.owner_id)
      .single();
    results.push({
      ...wl,
      items: items ?? [],
      owner: owner ?? undefined,
      item_count: items?.length ?? 0,
    });
  }
  return results;
}

// ═══════════════════════════════════════════════════════════════
// ITEMS
// ═══════════════════════════════════════════════════════════════

export async function getItem(itemId: string): Promise<ItemWithDetails | null> {
  const { data: item, error: itemError } = await supabase
    .from("items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle();

  if (itemError) throw itemError;
  if (!item) return null;

  const historySince = new Date(Date.now() - 366 * 24 * 60 * 60 * 1000).toISOString();
  const [historyResult, offersResult, wishlistResult] = await Promise.all([
    supabase
      .from("price_points")
      .select("*")
      .eq("item_id", itemId)
      .gte("recorded_at", historySince)
      .order("recorded_at", { ascending: true }),
    supabase
      .from("store_offers")
      .select("*")
      .eq("item_id", itemId)
      .order("price", { ascending: true }),
    supabase
      .from("wishlists")
      .select("*")
      .eq("id", item.wishlist_id)
      .maybeSingle(),
  ]);

  if (historyResult.error) throw historyResult.error;
  if (offersResult.error) throw offersResult.error;
  if (wishlistResult.error) throw wishlistResult.error;

  return {
    ...item,
    price_points: historyResult.data ?? [],
    store_offers: offersResult.data ?? [],
    wishlist: wishlistResult.data ?? undefined,
  };
}

export async function createItem(
  item: Omit<Item, "id" | "created_at" | "updated_at">
): Promise<Item | null> {
  const { data } = await supabase
    .from("items")
    .insert(item)
    .select()
    .single();
  return data;
}

export async function updateItem(
  id: string,
  updates: Omit<Partial<Item>, "id" | "wishlist_id" | "created_at">
): Promise<Item | null> {
  const { data } = await supabase
    .from("items")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  return data;
}

export async function deleteItem(id: string): Promise<boolean> {
  const { error } = await supabase.from("items").delete().eq("id", id);
  return !error;
}

export async function moveItem(
  itemId: string,
  targetWishlistId: string
): Promise<Item | null> {
  return updateItem(itemId, { wishlist_id: targetWishlistId } as Partial<Item>);
}

// ═══════════════════════════════════════════════════════════════
// PRICE TRACKING
// ═══════════════════════════════════════════════════════════════

export async function getPriceHistory(
  itemId: string,
  days = 30
): Promise<PricePoint[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from("price_points")
    .select("*")
    .eq("item_id", itemId)
    .gte("recorded_at", since.toISOString())
    .order("recorded_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getStoreOffers(itemId: string): Promise<StoreOffer[]> {
  const { data, error } = await supabase
    .from("store_offers")
    .select("*")
    .eq("item_id", itemId)
    .order("price", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ═══════════════════════════════════════════════════════════════
// RESERVATIONS
// ═══════════════════════════════════════════════════════════════

export async function reserveItem(
  itemId: string,
  userId: string
): Promise<boolean> {
  const { error: rError } = await supabase
    .from("reservations")
    .insert({ item_id: itemId, reserver_id: userId });
  if (rError) return false;
  await supabase
    .from("items")
    .update({ status: "reserved" as ItemStatus })
    .eq("id", itemId);
  return true;
}

export async function unreserveItem(
  itemId: string,
  userId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("reservations")
    .delete()
    .eq("item_id", itemId)
    .eq("reserver_id", userId);
  if (error) return false;
  await supabase
    .from("items")
    .update({ status: "wanted" as ItemStatus })
    .eq("id", itemId);
  return true;
}

export async function getMyReservations(userId: string): Promise<Reservation[]> {
  const { data } = await supabase
    .from("reservations")
    .select("*")
    .eq("reserver_id", userId);
  return data ?? [];
}

// ═══════════════════════════════════════════════════════════════
// FRIENDSHIPS
// ═══════════════════════════════════════════════════════════════

export async function sendFriendRequest(
  requesterId: string,
  addresseeId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("friendships")
    .insert({ requester_id: requesterId, addressee_id: addresseeId, status: "pending" as FriendshipStatus });
  return !error;
}

export async function respondToFriendRequest(
  friendshipId: string,
  status: "accepted" | "declined"
): Promise<boolean> {
  const { error } = await supabase
    .from("friendships")
    .update({ status: status as FriendshipStatus, updated_at: new Date().toISOString() })
    .eq("id", friendshipId);
  return !error;
}

export async function removeFriend(friendshipId: string): Promise<boolean> {
  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", friendshipId);
  return !error;
}

export async function getFriends(userId: string): Promise<FriendshipWithProfile[]> {
  const { data: sent } = await supabase
    .from("friendships")
    .select("*, profile:profiles!friendships_addressee_id_fkey(*)")
    .eq("requester_id", userId)
    .eq("status", "accepted");

  const { data: received } = await supabase
    .from("friendships")
    .select("*, profile:profiles!friendships_requester_id_fkey(*)")
    .eq("addressee_id", userId)
    .eq("status", "accepted");

  return [...(sent ?? []), ...(received ?? [])] as FriendshipWithProfile[];
}

export async function getFriendRequests(
  userId: string
): Promise<FriendshipWithProfile[]> {
  const { data } = await supabase
    .from("friendships")
    .select("*, profile:profiles!friendships_requester_id_fkey(*)")
    .eq("addressee_id", userId)
    .eq("status", "pending");
  return (data ?? []) as FriendshipWithProfile[];
}

async function getFriendIds(userId: string): Promise<string[]> {
  const friends = await getFriends(userId);
  return friends.map((f) =>
    f.requester_id === userId ? f.addressee_id : f.requester_id
  );
}

export async function getFriendshipStatus(
  userId: string,
  otherId: string
): Promise<Friendship | null> {
  const { data } = await supabase
    .from("friendships")
    .select("*")
    .or(
      `and(requester_id.eq.${userId},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${userId})`
    )
    .single();
  return data;
}

// ═══════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════

export async function getNotifications(userId: string): Promise<Notification[]> {
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  return data ?? [];
}

export async function markNotificationRead(id: string): Promise<boolean> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  return !error;
}

export async function markAllNotificationsRead(userId: string): Promise<boolean> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
  return !error;
}

export async function getUnreadCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  return count ?? 0;
}

// ═══════════════════════════════════════════════════════════════
// EDGE FUNCTIONS
// ═══════════════════════════════════════════════════════════════

export class ProductImportRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductImportRateLimitError";
  }
}

export async function fetchProduct(url: string): Promise<FetchedProduct | null> {
  try {
    const { data, error } = await supabase.functions.invoke("fetch-product", {
      body: { url },
    });
    if (error) {
      const context = error.context;
      if (context instanceof Response && context.status === 429) {
        let message = "You have reached the URL import limit. Wait one minute and try again.";
        try {
          const payload = await context.clone().json() as { error?: unknown };
          if (typeof payload.error === "string" && payload.error.trim()) message = payload.error;
        } catch { /* Keep the explicit rate-limit message. */ }
        throw new ProductImportRateLimitError(message);
      }
      throw error;
    }
    return data as FetchedProduct;
  } catch (error) {
    if (error instanceof ProductImportRateLimitError) throw error;
    return null;
  }
}

export async function sendAiMessage(
  message: string,
  styleProfile: StyleProfile | null,
  history: AiMessage[]
): Promise<{ content: string; suggestions: AiSuggestion[] } | null> {
  const { data, error } = await supabase.functions.invoke("ai-assistant", {
    body: { message, styleProfile, history: history.slice(-10) },
  });
  if (error) throw await getFunctionError(error, 'The shopping assistant is unavailable right now.');
  return data;
}

export async function getFunctionError(error: unknown, fallback: string): Promise<Error> {
  const context = error && typeof error === 'object' && 'context' in error
    ? (error as { context?: unknown }).context
    : null;
  if (context instanceof Response) {
    try {
      const payload = await context.clone().json() as { error?: unknown; message?: unknown };
      const message = typeof payload.error === 'string' ? payload.error : payload.message;
      if (typeof message === 'string' && message.trim()) return new Error(message);
    } catch {
      // The server returned a non-JSON response; use the caller's safe fallback.
    }
    if (context.status === 401) return new Error('Your session expired. Sign in again, then retry.');
    if (context.status === 429) return new Error('Too many requests. Wait a moment and retry.');
  }
  return new Error(fallback);
}

// ═══════════════════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════════════════

export async function uploadAvatar(
  userId: string,
  file: File
): Promise<string | null> {
  const ext = file.name.split(".").pop();
  const path = `${userId}/avatar.${ext}`;
  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true });
  if (error) return null;
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadCover(
  userId: string,
  wishlistId: string,
  file: File
): Promise<string | null> {
  const ext = file.name.split(".").pop();
  const path = `${userId}/${wishlistId}/cover.${ext}`;
  const { error } = await supabase.storage
    .from("covers")
    .upload(path, file, { upsert: true });
  if (error) return null;
  const { data } = supabase.storage.from("covers").getPublicUrl(path);
  return data.publicUrl;
}

// ═══════════════════════════════════════════════════════════════
// AUTH HELPERS
// ═══════════════════════════════════════════════════════════════

export async function signInWithEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithEmail(
  email: string,
  password: string,
  username: string,
  displayName: string
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username, display_name: displayName },
    },
  });
  return { data, error };
}

export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
}

export async function signInWithApple() {
  return supabase.auth.signInWithOAuth({
    provider: "apple",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function deleteAccount(userId: string) {
  // In production this would be a server-side function
  await supabase.from("profiles").delete().eq("id", userId);
  await supabase.auth.signOut();
}
