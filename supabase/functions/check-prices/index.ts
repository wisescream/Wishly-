import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAlertDeduplicationKey, getAlertObservation } from "./_shared/price-alert.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-price-check-secret" };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) throw new Error("Supabase configuration missing");
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const cronSecret = req.headers.get("x-price-check-secret");
    if (!cronSecret || cronSecret.length > 256) {
      return new Response(JSON.stringify({ error: "Unauthorized price-check invocation." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401,
      });
    }
    const { data: authorized, error: authError } = await supabase.rpc("is_valid_price_check_secret", { p_candidate: cronSecret });
    if (authError || authorized !== true) {
      return new Response(JSON.stringify({ error: "Unauthorized price-check invocation." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401,
      });
    }

    // Use fresh, same-currency observations. A provider item price may trigger
    // an alert, but its message must say when shipping or stock is unknown.
    const { data: items, error } = await supabase.from("items")
      .select("id,title,target_price,current_price,currency,wishlists!inner(owner_id)");
    if (error) throw error;
    let checked = 0;
    let alerts = 0;
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    for (const item of items || []) {
      checked++;
      const ownerId = (item.wishlists as unknown as { owner_id?: string } | null)?.owner_id;
      if (!ownerId) continue;
      const { data: offers } = await supabase.from("store_offers")
        .select("id,price,total_price,currency,condition,availability,last_verified_at,total_is_estimated,source,store,url")
        .eq("item_id", item.id)
        .gte("last_verified_at", cutoff);

      for (const offer of offers || []) {
        const alertObservation = getAlertObservation(item, offer);
        if (!alertObservation) continue;
        const { price: observedPrice, completeTotal: hasCompleteTotal, target: hitTarget } = alertObservation;
        const { data: event, error: eventError } = await supabase.from("price_alert_events")
          .upsert({
            user_id: ownerId,
            item_id: item.id,
            offer_id: offer.id,
            observed_at: offer.last_verified_at,
            price: observedPrice,
            currency: offer.currency,
          }, { onConflict: "item_id,offer_id,observed_at", ignoreDuplicates: true })
          .select("id")
          .maybeSingle();
        if (eventError) continue;
        const eventRecord = event || (await supabase.from("price_alert_events").select("id")
          .eq("item_id", item.id).eq("offer_id", offer.id).eq("observed_at", offer.last_verified_at).maybeSingle()).data;
        if (!eventRecord) continue;
        const eventKey = getAlertDeduplicationKey(item.id, offer, alertObservation);
        const { data: notification, error: notificationError } = await supabase.from("notifications").upsert({
          user_id: ownerId,
          type: "price_drop",
          title: hitTarget ? `Target price reached: ${item.title}` : `A lower offer was found: ${item.title}`,
          body: hasCompleteTotal
            ? `Fresh offer total: ${observedPrice} ${offer.currency} at ${offer.store}.`
            : `Google Shopping lists ${observedPrice} ${offer.currency} at ${offer.store}. Shipping, taxes, stock, and retailer checkout price are not confirmed.`,
          price_drop_key: eventKey,
          payload: { item_id: item.id, offer_id: offer.id, price: observedPrice, target_price: item.target_price, currency: offer.currency, source: offer.source, url: offer.url, total_confirmed: hasCompleteTotal },
        }, { onConflict: "user_id,price_drop_key", ignoreDuplicates: true }).select("id").maybeSingle();
        if (!notificationError && notification) alerts++;
      }
    }

    return new Response(JSON.stringify({ success: true, items_checked: checked, alerts_triggered: alerts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });
  } catch {
    return new Response(JSON.stringify({ error: "Price alert check failed." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
