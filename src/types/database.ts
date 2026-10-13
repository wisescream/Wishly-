export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Privacy = "private" | "friends" | "public";
export type ItemStatus = "wanted" | "reserved" | "purchased";
export type FriendshipStatus = "pending" | "accepted" | "declined" | "blocked";
export type NotificationType =
  | "price_drop"
  | "back_in_stock"
  | "friend_request"
  | "friend_accepted"
  | "item_reserved"
  | "occasion_reminder"
  | "birthday_reminder"
  | "new_list";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string | null;
          avatar_url: string | null;
          birthday: string | null;
          country: string;
          currency: string;
          language: string;
          is_premium: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          display_name?: string | null;
          avatar_url?: string | null;
          birthday?: string | null;
          country?: string;
          currency?: string;
          language?: string;
          is_premium?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          username?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          birthday?: string | null;
          country?: string;
          currency?: string;
          language?: string;
          is_premium?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      style_profiles: {
        Row: {
          id: string;
          user_id: string;
          clothing_sizes: Json;
          shoe_size: string | null;
          brands: string[];
          colors: string[];
          style_tags: string[];
          budget_min: number | null;
          budget_max: number | null;
          sizing_context: 'mens' | 'womens' | 'unisex_mixed' | 'unspecified';
          apparel_sizes: Json;
          shoe_sizes: Json;
          measurements: Json;
          fit_preferences: Json;
          accessory_sizes: Json;
          brand_sizes: Json;
          allowed_alternative_sizes: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          clothing_sizes?: Json;
          shoe_size?: string | null;
          brands?: string[];
          colors?: string[];
          style_tags?: string[];
          budget_min?: number | null;
          budget_max?: number | null;
          sizing_context?: 'mens' | 'womens' | 'unisex_mixed' | 'unspecified';
          apparel_sizes?: Json;
          shoe_sizes?: Json;
          measurements?: Json;
          fit_preferences?: Json;
          accessory_sizes?: Json;
          brand_sizes?: Json;
          allowed_alternative_sizes?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          clothing_sizes?: Json;
          shoe_size?: string | null;
          brands?: string[];
          colors?: string[];
          style_tags?: string[];
          budget_min?: number | null;
          budget_max?: number | null;
          sizing_context?: 'mens' | 'womens' | 'unisex_mixed' | 'unspecified';
          apparel_sizes?: Json;
          shoe_sizes?: Json;
          measurements?: Json;
          fit_preferences?: Json;
          accessory_sizes?: Json;
          brand_sizes?: Json;
          allowed_alternative_sizes?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      wishlists: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          slug: string;
          occasion: string | null;
          event_date: string | null;
          cover_url: string | null;
          privacy: Privacy;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          slug: string;
          occasion?: string | null;
          event_date?: string | null;
          cover_url?: string | null;
          privacy?: Privacy;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          slug?: string;
          occasion?: string | null;
          event_date?: string | null;
          cover_url?: string | null;
          privacy?: Privacy;
          position?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      items: {
        Row: {
          id: string;
          wishlist_id: string;
          title: string;
          image_url: string | null;
          url: string | null;
          store: string | null;
          current_price: number | null;
          original_price: number | null;
          currency: string;
          description: string | null;
          category: string | null;
          additional_images: string[];
          variant_label: string | null;
          condition: string;
          price_source: string | null;
          last_offer_search_at: string | null;
          next_price_alert_check_at: string;
          priority: number;
          notes: string | null;
          status: ItemStatus;
          target_price: number | null;
          price_drop_percent: number | null;
          alert_on_any_lower_price: boolean;
          alert_on_new_cheaper_offer: boolean;
          alert_on_back_in_stock: boolean;
          position: number;
          product_id: string | null;
          variant_id: string | null;
          brand: string | null;
          model_number: string | null;
          gtin: string | null;
          is_verified: boolean;
          enrichment_status: string;
          offers_last_checked_at: string | null;
          enrichment_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          wishlist_id: string;
          title: string;
          image_url?: string | null;
          url?: string | null;
          store?: string | null;
          current_price?: number | null;
          original_price?: number | null;
          currency?: string;
          description?: string | null;
          category?: string | null;
          additional_images?: string[];
          variant_label?: string | null;
          condition?: string;
          price_source?: string | null;
          last_offer_search_at?: string | null;
          next_price_alert_check_at?: string;
          priority?: number;
          notes?: string | null;
          status?: ItemStatus;
          target_price?: number | null;
          price_drop_percent?: number | null;
          alert_on_any_lower_price?: boolean;
          alert_on_new_cheaper_offer?: boolean;
          alert_on_back_in_stock?: boolean;
          position?: number;
          product_id?: string | null;
          variant_id?: string | null;
          brand?: string | null;
          model_number?: string | null;
          gtin?: string | null;
          is_verified?: boolean;
          enrichment_status?: string;
          offers_last_checked_at?: string | null;
          enrichment_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          image_url?: string | null;
          url?: string | null;
          store?: string | null;
          current_price?: number | null;
          original_price?: number | null;
          currency?: string;
          description?: string | null;
          category?: string | null;
          additional_images?: string[];
          variant_label?: string | null;
          condition?: string;
          price_source?: string | null;
          last_offer_search_at?: string | null;
          next_price_alert_check_at?: string;
          priority?: number;
          notes?: string | null;
          status?: ItemStatus;
          target_price?: number | null;
          price_drop_percent?: number | null;
          alert_on_any_lower_price?: boolean;
          alert_on_new_cheaper_offer?: boolean;
          alert_on_back_in_stock?: boolean;
          position?: number;
          product_id?: string | null;
          variant_id?: string | null;
          brand?: string | null;
          model_number?: string | null;
          gtin?: string | null;
          is_verified?: boolean;
          enrichment_status?: string;
          offers_last_checked_at?: string | null;
          enrichment_error?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          title: string;
          brand: string | null;
          model_number: string | null;
          gtin: string | null;
          description: string | null;
          primary_image_url: string | null;
          additional_images: string[];
          category: string | null;
          attributes: Json;
          offers_last_checked_at: string | null;
          offer_search_status: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          brand?: string | null;
          model_number?: string | null;
          gtin?: string | null;
          description?: string | null;
          primary_image_url?: string | null;
          additional_images?: string[];
          category?: string | null;
          attributes?: Json;
          offers_last_checked_at?: string | null;
          offer_search_status?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          brand?: string | null;
          model_number?: string | null;
          gtin?: string | null;
          description?: string | null;
          primary_image_url?: string | null;
          additional_images?: string[];
          category?: string | null;
          attributes?: Json;
          offers_last_checked_at?: string | null;
          offer_search_status?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      product_variants: {
        Row: {
          id: string;
          product_id: string;
          name: string;
          sku: string | null;
          gtin: string | null;
          color: string | null;
          size: string | null;
          capacity: string | null;
          condition: string;
          attributes: Json;
          image_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          name: string;
          sku?: string | null;
          gtin?: string | null;
          color?: string | null;
          size?: string | null;
          capacity?: string | null;
          condition?: string;
          attributes?: Json;
          image_url?: string | null;
          created_at?: string;
        };
        Update: {
          name?: string;
          sku?: string | null;
          gtin?: string | null;
          color?: string | null;
          size?: string | null;
          capacity?: string | null;
          condition?: string;
          attributes?: Json;
          image_url?: string | null;
        };
        Relationships: [];
      };
      retailers: {
        Row: {
          id: string;
          name: string;
          domain: string;
          country_code: string;
          logo_url: string | null;
          is_supported: boolean;
          affiliate_tag: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          domain: string;
          country_code?: string;
          logo_url?: string | null;
          is_supported?: boolean;
          affiliate_tag?: string | null;
          created_at?: string;
        };
        Update: {
          name?: string;
          domain?: string;
          country_code?: string;
          logo_url?: string | null;
          is_supported?: boolean;
          affiliate_tag?: string | null;
        };
        Relationships: [];
      };
      import_jobs: {
        Row: {
          id: string;
          user_id: string;
          import_type: string;
          input_value: string;
          status: string;
          extracted_data: Json;
          confidence_score: number | null;
          error_message: string | null;
          created_at: string;
          updated_at: string;
          retry_count: number;
          next_attempt_at: string | null;
          completed_at: string | null;
          product_id: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          import_type: string;
          input_value: string;
          status?: string;
          extracted_data?: Json;
          confidence_score?: number | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
          retry_count?: number;
          next_attempt_at?: string | null;
          completed_at?: string | null;
          product_id?: string | null;
        };
        Update: {
          status?: string;
          extracted_data?: Json;
          confidence_score?: number | null;
          error_message?: string | null;
          updated_at?: string;
          retry_count?: number;
          next_attempt_at?: string | null;
          completed_at?: string | null;
          product_id?: string | null;
        };
        Relationships: [];
      };
      price_points: {
        Row: {
          id: string;
          item_id: string;
          price: number;
          store: string;
          recorded_at: string;
          currency: string;
          source: string | null;
          offer_id: string | null;
          availability: string | null;
          source_url: string | null;
          is_verified: boolean;
          observation_day: string;
        };
        Insert: {
          id?: string;
          item_id: string;
          price: number;
          store: string;
          recorded_at?: string;
          currency?: string;
          source?: string | null;
          offer_id?: string | null;
          availability?: string | null;
          source_url?: string | null;
          is_verified?: boolean;
          observation_day?: string;
        };
        Update: {};
        Relationships: [];
      };
      store_offers: {
        Row: {
          id: string;
          item_id: string;
          product_id: string | null;
          variant_id: string | null;
          store: string;
          price: number;
          original_price: number | null;
          discount_percent: number | null;
          currency: string;
          shipping_cost: number;
          taxes: number;
          total_price: number | null;
          condition: string;
          availability: string;
          delivery_estimate: string | null;
          source: string;
          url: string;
          affiliate_url: string | null;
          last_verified_at: string;
          created_at: string;
          updated_at: string;
          shipping_known: boolean;
          taxes_known: boolean;
          total_is_estimated: boolean;
          destination_country: string | null;
          seller: string | null;
          currency_converted_to: string | null;
          converted_price: number | null;
          converted_total_price: number | null;
          exchange_rate: number | null;
          exchange_rate_at: string | null;
          exchange_rate_source: string | null;
          last_error: string | null;
          listing_title: string | null;
          image_url: string | null;
          size_label: string | null;
          size_system: string | null;
          color_label: string | null;
          product_match_confidence: number | null;
          match_type: string | null;
          is_verified: boolean;
          seller_type: 'official' | 'authorized' | 'independent' | 'marketplace' | 'reseller' | 'outlet' | 'second_hand' | 'unknown';
        };
        Insert: {
          id?: string;
          item_id: string;
          product_id?: string | null;
          variant_id?: string | null;
          store: string;
          price: number;
          original_price?: number | null;
          discount_percent?: number | null;
          currency?: string;
          shipping_cost?: number;
          taxes?: number;
          total_price?: number | null;
          condition?: string;
          availability?: string;
          delivery_estimate?: string | null;
          source?: string;
          url: string;
          affiliate_url?: string | null;
          last_verified_at?: string;
          created_at?: string;
          updated_at?: string;
          shipping_known?: boolean;
          taxes_known?: boolean;
          total_is_estimated?: boolean;
          destination_country?: string | null;
          seller?: string | null;
          currency_converted_to?: string | null;
          converted_price?: number | null;
          converted_total_price?: number | null;
          exchange_rate?: number | null;
          exchange_rate_at?: string | null;
          exchange_rate_source?: string | null;
          last_error?: string | null;
          listing_title?: string | null;
          image_url?: string | null;
          size_label?: string | null;
          size_system?: string | null;
          color_label?: string | null;
          product_match_confidence?: number | null;
          match_type?: string | null;
          is_verified?: boolean;
          seller_type?: 'official' | 'authorized' | 'independent' | 'marketplace' | 'reseller' | 'outlet' | 'second_hand' | 'unknown';
        };
        Update: {
          price?: number;
          original_price?: number | null;
          discount_percent?: number | null;
          currency?: string;
          shipping_cost?: number;
          taxes?: number;
          total_price?: number | null;
          condition?: string;
          availability?: string;
          delivery_estimate?: string | null;
          source?: string;
          url?: string;
          affiliate_url?: string | null;
          last_verified_at?: string;
          updated_at?: string;
          shipping_known?: boolean;
          taxes_known?: boolean;
          total_is_estimated?: boolean;
          destination_country?: string | null;
          seller?: string | null;
          currency_converted_to?: string | null;
          converted_price?: number | null;
          converted_total_price?: number | null;
          exchange_rate?: number | null;
          exchange_rate_at?: string | null;
          exchange_rate_source?: string | null;
          last_error?: string | null;
          listing_title?: string | null;
          image_url?: string | null;
          size_label?: string | null;
          size_system?: string | null;
          color_label?: string | null;
          product_match_confidence?: number | null;
          match_type?: string | null;
          is_verified?: boolean;
          seller_type?: 'official' | 'authorized' | 'independent' | 'marketplace' | 'reseller' | 'outlet' | 'second_hand' | 'unknown';
        };
        Relationships: [];
      };
      reservations: {
        Row: {
          id: string;
          item_id: string;
          reserver_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          item_id: string;
          reserver_id: string;
          created_at?: string;
        };
        Update: {};
        Relationships: [];
      };
      friendships: {
        Row: {
          id: string;
          requester_id: string;
          addressee_id: string;
          status: FriendshipStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          requester_id: string;
          addressee_id: string;
          status?: FriendshipStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: FriendshipStatus;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "friendships_requester_id_fkey"; columns: ["requester_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "friendships_addressee_id_fkey"; columns: ["addressee_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: NotificationType;
          title: string;
          body: string | null;
          payload: Json | null;
          read_at: string | null;
          price_drop_key: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: NotificationType;
          title: string;
          body?: string | null;
          payload?: Json | null;
          read_at?: string | null;
          price_drop_key?: string | null;
          created_at?: string;
        };
        Update: {
          read_at?: string | null;
          price_drop_key?: string | null;
        };
        Relationships: [];
      };
      price_alert_events: {
        Row: { id: string; user_id: string; item_id: string; offer_id: string; observed_at: string; price: number; currency: string; created_at: string };
        Insert: { id?: string; user_id: string; item_id: string; offer_id: string; observed_at: string; price: number; currency: string; created_at?: string };
        Update: {};
        Relationships: [];
      };
    };
    Views: {};
    Functions: {
      get_friend_ids: {
        Args: { uid: string };
        Returns: string[];
      };
      reserve_product_import: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      reserve_interactive_provider_request: {
        Args: { p_surface: string };
        Returns: boolean;
      };
      claim_due_price_alert_items: {
        Args: { p_limit?: number };
        Returns: {
          id: string;
          wishlist_id: string;
          title: string;
          variant_label: string | null;
          target_price: number | null;
          current_price: number | null;
          price_drop_percent: number | null;
          alert_on_any_lower_price: boolean;
          alert_on_new_cheaper_offer: boolean;
          alert_on_back_in_stock: boolean;
          currency: string;
          condition: string;
          owner_id: string;
        }[];
      };
      save_wishlist_item_once: {
        Args: {
          p_wishlist_id: string;
          p_title: string;
          p_image_url: string | null;
          p_additional_images: string[];
          p_description: string | null;
          p_category: string | null;
          p_variant_label: string | null;
          p_url: string | null;
          p_store: string | null;
          p_current_price: number | null;
          p_original_price: number | null;
          p_currency: string;
          p_priority: number;
          p_notes: string | null;
          p_target_price: number | null;
          p_product_id: string | null;
          p_variant_id: string | null;
          p_brand: string | null;
          p_model_number: string | null;
          p_gtin: string | null;
          p_is_verified: boolean;
          p_price_source: string;
        };
        Returns: { item_id: string; is_duplicate: boolean }[];
      };
      save_wishlist_item_once_with_condition: {
        Args: {
          p_wishlist_id: string;
          p_title: string;
          p_image_url: string | null;
          p_additional_images: string[];
          p_description: string | null;
          p_category: string | null;
          p_variant_label: string | null;
          p_url: string | null;
          p_store: string | null;
          p_current_price: number | null;
          p_original_price: number | null;
          p_currency: string;
          p_priority: number;
          p_notes: string | null;
          p_target_price: number | null;
          p_product_id: string | null;
          p_variant_id: string | null;
          p_brand: string | null;
          p_model_number: string | null;
          p_gtin: string | null;
          p_is_verified: boolean;
          p_price_source: string;
          p_condition: string;
        };
        Returns: { item_id: string; is_duplicate: boolean }[];
      };
      resolve_catalog_product: {
        Args: { p_title: string; p_brand?: string | null; p_model_number?: string | null; p_gtin?: string | null; p_image_url?: string | null };
        Returns: string | null;
      };
      resolve_product_variant: {
        Args: { p_product_id: string; p_name: string };
        Returns: string | null;
      };
      record_price_observation: {
        Args: {
          p_item_id: string;
          p_price: number;
          p_currency: string;
          p_store: string;
          p_source?: string | null;
          p_offer_id?: string | null;
          p_source_url?: string | null;
          p_availability?: string | null;
          p_is_verified?: boolean;
          p_recorded_at?: string;
        };
        Returns: string | null;
      };
    };
    Enums: {
      privacy: Privacy;
      item_status: ItemStatus;
      friendship_status: FriendshipStatus;
    };
  };
}

// ─── Convenience row types ───────────────────────────────────
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type StyleProfile = Database["public"]["Tables"]["style_profiles"]["Row"];
export type Wishlist = Database["public"]["Tables"]["wishlists"]["Row"];
export type Item = Database["public"]["Tables"]["items"]["Row"];
export type Product = Database["public"]["Tables"]["products"]["Row"];
export type ProductVariant = Database["public"]["Tables"]["product_variants"]["Row"];
export type Retailer = Database["public"]["Tables"]["retailers"]["Row"];
export type ImportJob = Database["public"]["Tables"]["import_jobs"]["Row"];
export type PricePoint = Database["public"]["Tables"]["price_points"]["Row"];
export type StoreOffer = Database["public"]["Tables"]["store_offers"]["Row"];
export type Reservation = Database["public"]["Tables"]["reservations"]["Row"];
export type Friendship = Database["public"]["Tables"]["friendships"]["Row"];
export type Notification = Database["public"]["Tables"]["notifications"]["Row"];

export type ImportType = "url" | "search" | "image" | "barcode" | "manual";
export type EnrichmentStatus =
  | "processing"
  | "identified"
  | "searching_offers"
  | "offers_available"
  | "manual_confirmation"
  | "partial"
  | "no_matches"
  | "failed"
  | "manual";

// ─── Product candidate for selection UI ──────────────────────
export interface ProductCandidate {
  id?: string;
  title: string;
  brand?: string | null;
  model_number?: string | null;
  gtin?: string | null;
  image_url?: string | null;
  description?: string | null;
  price?: number | null;
  condition?: string;
  currency?: string;
  store?: string | null;
  url?: string | null;
  confidence: number;
  match_reason?: string;
  source: string;
  variants?: Array<{
    name: string;
    color?: string;
    size?: string;
    capacity?: string;
    condition?: string;
  }>;
}

// ─── Composite types ────────────────────────────────────────
export interface WishlistWithItems extends Wishlist {
  items: Item[];
  owner?: Profile;
  item_count?: number;
  total_value?: number;
  reserved_count?: number;
}

export interface ItemWithDetails extends Item {
  price_points?: PricePoint[];
  store_offers?: StoreOffer[];
  is_reserved_by_me?: boolean;
  wishlist?: Wishlist;
  product?: Product | null;
  variant?: ProductVariant | null;
}

export interface ProfileWithStats extends Profile {
  wishlist_count: number;
  friend_count: number;
  style_profile?: StyleProfile | null;
}

export interface FriendshipWithProfile extends Friendship {
  profile: Profile;
}

// ─── AI types ────────────────────────────────────────────────
export interface AiSuggestion {
  id: string;
  title: string;
  image_url: string;
  price: number;
  currency: string;
  store: string;
  url: string;
  reason: string;
}

export interface AiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggestions?: AiSuggestion[];
  timestamp: Date;
}

// ─── Product fetch & import result ───────────────────────────
export interface FetchedOffer {
  store: string;
  price: number;
  currency: string;
  shipping_cost?: number;
  shipping_known?: boolean;
  taxes?: number;
  taxes_known?: boolean;
  total_price?: number | null;
  total_is_estimated?: boolean;
  condition?: string;
  availability?: string;
  delivery_estimate?: string;
  url: string;
  affiliate_url?: string;
  source?: string;
  seller_type?: 'official' | 'authorized' | 'independent' | 'marketplace' | 'reseller' | 'outlet' | 'second_hand' | 'unknown';
  last_verified_at?: string;
}

export interface FetchedProduct {
  title: string;
  image_url: string | null;
  additional_images?: string[];
  price: number | null;
  price_conflict?: boolean;
  original_price?: number | null;
  discount_percent?: number | null;
  currency: string;
  store: string | null;
  description: string | null;
  category?: string | null;
  canonical_url?: string | null;
  variant_name?: string | null;
  variant_details?: { color?: string; size?: string; capacity?: string; sku?: string };
  brand?: string | null;
  model_number?: string | null;
  gtin?: string | null;
  sku?: string | null;
  condition?: string;
  availability?: string;
  variants?: Array<{
    name: string;
    sku?: string;
    gtin?: string;
    color?: string;
    size?: string;
    capacity?: string;
    price?: number;
    image_url?: string;
  }>;
  offers?: FetchedOffer[];
  confidence?: number;
  source?: string;
  extraction_status?: "complete" | "partial" | "failed";
}

// ─── Premium tier ────────────────────────────────────────────
export interface PremiumLimits {
  maxLists: number;
  maxTrackedItems: number;
  priceHistoryDays: number;
  dailyAiMessages: number;
  advancedFilters: boolean;
  earlyDropAlerts: boolean;
}

export const FREE_LIMITS: PremiumLimits = {
  maxLists: 5,
  maxTrackedItems: 10,
  priceHistoryDays: 30,
  dailyAiMessages: 10,
  advancedFilters: false,
  earlyDropAlerts: false,
};

export const PREMIUM_LIMITS: PremiumLimits = {
  maxLists: Infinity,
  maxTrackedItems: Infinity,
  priceHistoryDays: 365,
  dailyAiMessages: Infinity,
  advancedFilters: true,
  earlyDropAlerts: true,
};
