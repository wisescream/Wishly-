import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAlertDeduplicationKey, getAlertObservation, getAlertSourceLabel, isBackInStockAlert } from "./_shared/price-alert.ts";
import { addOfferCurrencyConversions } from "./_shared/exchange-rate.ts";

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
    const { data: items, error } = await supabase.rpc("claim_due_price_alert_items", { p_limit: 5 });
    if (error) throw error;
    let checked = 0;
    let alerts = 0;
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    for (const item of items || []) {
      checked++;
      const ownerId = item.owner_id;
      if (!ownerId) continue;
      const { data: offers, error: offersError } = await supabase.from("store_offers")
        .select("id,price,total_price,currency,condition,availability,last_verified_at,created_at,total_is_estimated,product_match_confidence,source,store,url,is_verified")
        .eq("item_id", item.id)
        .gte("last_verified_at", cutoff)
        .order("last_verified_at", { ascending: false })
        .limit(12);
      if (offersError) throw offersError;

      const localizedOffers = await addOfferCurrencyConversions(offers || [], String(item.currency || "USD"));
      for (const sourceOffer of localizedOffers) {
        const offer = sourceOffer.currency === item.currency || sourceOffer.currency_converted_to === item.currency
          ? {
            ...sourceOffer,
            original_currency: sourceOffer.currency,
            currency: item.currency,
            price: sourceOffer.currency === item.currency ? sourceOffer.price : sourceOffer.converted_price ?? sourceOffer.price,
            total_price: sourceOffer.currency === item.currency ? sourceOffer.total_price : sourceOffer.converted_total_price,
          }
          : sourceOffer;
        const alertObservation = getAlertObservation(item, offer);
        if (alertObservation) {
          const { price: observedPrice, completeTotal: hasCompleteTotal, target: hitTarget, percentage, newCheaper } = alertObservation;
          const { data: event, error: eventError } = await supabase.from("price_alert_events")
            .upsert({ user_id: ownerId, item_id: item.id, offer_id: offer.id, observed_at: offer.last_verified_at, price: observedPrice, currency: offer.currency },
              { onConflict: "item_id,offer_id,observed_at", ignoreDuplicates: true })
            .select("id").maybeSingle();
          if (eventError) {
            console.error(JSON.stringify({ event: "wishly_price_alert_persistence_failed", stage: "event_upsert", item_id: item.id, offer_id: offer.id, error_code: eventError.code || null }));
          } else {
            const existingEvent = event ? null : await supabase.from("price_alert_events").select("id")
              .eq("item_id", item.id).eq("offer_id", offer.id).eq("observed_at", offer.last_verified_at).maybeSingle();
            if (existingEvent?.error) {
              console.error(JSON.stringify({ event: "wishly_price_alert_persistence_failed", stage: "event_lookup", item_id: item.id, offer_id: offer.id, error_code: existingEvent.error.code || null }));
            }
            const eventRecord = event || existingEvent?.data;
            if (eventRecord) {
              const eventKey = getAlertDeduplicationKey(item.id, offer, alertObservation);
              const oldPrice = item.current_price == null ? null : Number(item.current_price);
              const savings = oldPrice != null && oldPrice > observedPrice ? oldPrice - observedPrice : null;
              const criterion = hitTarget ? "Target price reached" : percentage ? `${item.price_drop_percent}% price drop` : newCheaper ? "New cheaper retailer offer" : "Lower price alert";
              const details = oldPrice == null ? "" : ` Saved listing: ${oldPrice} ${offer.currency}; offer: ${observedPrice} ${offer.currency}${savings == null ? "" : `; savings ${savings} ${offer.currency}`}.`;
              const fxNote = offer.original_currency && offer.original_currency !== offer.currency
                ? ` Converted from ${offer.original_currency} at reference rate ${offer.exchange_rate} dated ${offer.exchange_rate_at}.`
                : "";
              const verification = new Date(offer.last_verified_at || Date.now()).toLocaleString("en-US", { timeZone: "UTC" });
              const { data: notification, error: notificationError } = await supabase.from("notifications").upsert({
                user_id: ownerId, type: "price_drop", title: `${criterion}: ${item.title}`,
              body: `${getAlertSourceLabel(offer.source)} at ${offer.store} (${offer.condition} condition).${details}${fxNote} Checked ${verification} UTC.${hasCompleteTotal ? " Total includes known delivery costs." : " Shipping, taxes, availability, and checkout price are not confirmed."}`,
                price_drop_key: eventKey,
                payload: { item_id: item.id, offer_id: offer.id, variant: item.variant_label, condition: offer.condition, price: observedPrice, old_price: oldPrice, savings, target_price: item.target_price, price_drop_percent: item.price_drop_percent, currency: offer.currency, original_currency: offer.original_currency || offer.currency, exchange_rate: offer.exchange_rate, exchange_rate_at: offer.exchange_rate_at, source: offer.source, url: offer.url, verified_at: offer.last_verified_at, total_confirmed: hasCompleteTotal },
              }, { onConflict: "user_id,price_drop_key", ignoreDuplicates: true }).select("id").maybeSingle();
              if (notificationError) {
                console.error(JSON.stringify({ event: "wishly_price_alert_persistence_failed", stage: "notification_upsert", item_id: item.id, offer_id: offer.id, error_code: notificationError.code || null }));
              } else if (notification) alerts++;
            }
          }
        }

        if (item.alert_on_back_in_stock && offer.availability === "in_stock") {
          const { data: latestPriorObservation, error: latestPriorError } = await supabase.from("price_points").select("id,availability")
            .eq("item_id", item.id).eq("offer_id", offer.id)
            .lt("recorded_at", offer.last_verified_at || new Date().toISOString())
            .order("recorded_at", { ascending: false }).limit(1).maybeSingle();
          if (latestPriorError) throw latestPriorError;
          if (isBackInStockAlert(item, offer, latestPriorObservation?.availability || null)) {
            const eventKey = `${item.id}:${offer.id}:back-in-stock:${offer.last_verified_at}`;
            const { data: notification, error: notificationError } = await supabase.from("notifications").upsert({
              user_id: ownerId, type: "back_in_stock", title: `Back in stock: ${item.title}`,
              body: `${offer.store} reports the ${item.variant_label ? `${item.variant_label} variant` : "item"} (${offer.condition} condition) in stock. Availability checked ${new Date(offer.last_verified_at || Date.now()).toLocaleString("en-US", { timeZone: "UTC" })} UTC; confirm with the retailer.`,
              price_drop_key: eventKey,
              payload: { item_id: item.id, offer_id: offer.id, variant: item.variant_label, condition: offer.condition, price: offer.price, currency: offer.currency, source: offer.source, url: offer.url, verified_at: offer.last_verified_at },
            }, { onConflict: "user_id,price_drop_key", ignoreDuplicates: true }).select("id").maybeSingle();
            if (notificationError) {
              console.error(JSON.stringify({ event: "wishly_price_alert_persistence_failed", stage: "back_in_stock_notification", item_id: item.id, offer_id: offer.id, error_code: notificationError.code || null }));
            } else if (notification) alerts++;
          }
        }
      }
      const intervalMinutes = item.target_price != null || item.price_drop_percent != null ? 30 : 60;
      const { error: rescheduleError } = await supabase.from("items").update({
        next_price_alert_check_at: new Date(Date.now() + intervalMinutes * 60 * 1000).toISOString(),
      }).eq("id", item.id).eq("status", "wanted");
      if (rescheduleError) {
        console.error(JSON.stringify({ event: "wishly_price_alert_reschedule_failed", item_id: item.id, error_code: rescheduleError.code || null }));
      }
    }

    return new Response(JSON.stringify({ success: true, items_checked: checked, alerts_triggered: alerts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });
  } catch (error) {
    const details = error && typeof error === "object" ? error as { code?: unknown; name?: unknown } : {};
    const errorCode = typeof details.code === "string" && /^[A-Z0-9_]{1,32}$/.test(details.code) ? details.code : null;
    console.error(JSON.stringify({ event: "wishly_price_alert_worker_failed", error_name: typeof details.name === "string" ? details.name.slice(0, 40) : "unknown_error", error_code: errorCode }));
    return new Response(JSON.stringify({ error: "Price alert check failed." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
