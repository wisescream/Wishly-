import { getResearchRetryDelayMs } from "./research-schedule.ts";

export type PersistenceStage = "offer_upsert" | "price_history";

interface PersistenceOffer {
  id?: string | null;
  store?: string | null;
  price?: number | null;
  currency?: string | null;
  source?: string | null;
  url?: string | null;
  availability?: string | null;
  last_verified_at?: string | null;
  is_verified?: boolean | null;
}

interface RpcAdmin {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data?: unknown; error?: { code?: string | null } | null }>;
}

interface RetryAdmin {
  from(table: string): {
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): PromiseLike<{ error?: { code?: string | null } | null }>;
    };
  };
}

export async function recordOfferPriceObservations(
  admin: RpcAdmin,
  itemId: string,
  offers: PersistenceOffer[],
  fallbackTimestamp: string,
): Promise<{ attempted: number; failed: number; errorCode: string | null }> {
  const eligible = offers.filter((offer) => offer.id && Number.isFinite(offer.price) && Number(offer.price) > 0 && Boolean(offer.currency));
  const results = await Promise.allSettled(eligible.map((offer) => admin.rpc("record_price_observation", {
    p_item_id: itemId,
    p_offer_id: offer.id,
    p_price: offer.price,
    p_store: offer.store || "Unknown",
    p_currency: offer.currency,
    p_source: offer.source || "google_shopping",
    p_source_url: offer.url || null,
    p_availability: offer.availability || "unknown",
    p_is_verified: offer.is_verified === true,
    p_recorded_at: offer.last_verified_at || fallbackTimestamp,
  })));
  let failed = 0;
  let errorCode: string | null = null;
  for (const result of results) {
    if (result.status === "rejected" || result.value.error || !result.value.data) {
      failed++;
      if (!errorCode && result.status === "fulfilled") errorCode = result.value.error?.code || "no_observation_id";
    }
  }
  return { attempted: eligible.length, failed, errorCode };
}

export async function deferPersistenceRetry(
  admin: RetryAdmin,
  item: { id: string; offer_search_attempts?: number | null },
  attemptedAt: string,
  stage: PersistenceStage,
): Promise<{ retryAt: string; attempts: number; scheduled: boolean; errorCode: string | null }> {
  const attempts = Number(item.offer_search_attempts || 0) + 1;
  const retryAt = new Date(Date.now() + getResearchRetryDelayMs(attempts)).toISOString();
  let errorCode: string | null;
  let scheduled = false;
  try {
    const result = await admin.from("items").update({
      last_offer_search_at: attemptedAt,
      next_offer_search_at: retryAt,
      offer_search_attempts: attempts,
      enrichment_status: "failed",
      enrichment_error: "Search results could not be saved. Wishly retained existing offers and scheduled a retry.",
    }).eq("id", item.id);
    errorCode = result.error?.code || null;
    scheduled = !result.error;
  } catch (error) {
    errorCode = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "retry_schedule_exception";
  }
  console.error(JSON.stringify({
    event: "wishly_research_persistence_failed",
    stage,
    item_id: item.id,
    retry_scheduled: scheduled,
    error_code: errorCode,
  }));
  return { retryAt, attempts, scheduled, errorCode };
}
