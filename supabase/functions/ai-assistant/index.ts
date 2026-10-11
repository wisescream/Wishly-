import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { message, styleProfile, history } = await req.json();
    if (typeof message !== "string" || !message.trim() || message.length > 2000) {
      return new Response(JSON.stringify({ error: "Enter a message under 2,000 characters." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }
    const apiKey = Deno.env.get("OPENROUTER_API_KEY");

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI assistant is not configured. Add OPENROUTER_API_KEY to Supabase Edge Function secrets to enable chat." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 503,
      });
    }

    const safeStyle = styleProfile && typeof styleProfile === "object" ? {
      sizing_context: styleProfile.sizing_context,
      apparel_sizes: styleProfile.apparel_sizes,
      shoe_sizes: styleProfile.shoe_sizes,
      fit_preferences: styleProfile.fit_preferences,
      accessory_sizes: styleProfile.accessory_sizes,
      brand_sizes: styleProfile.brand_sizes,
      style_tags: styleProfile.style_tags,
      brands: styleProfile.brands,
      colors: styleProfile.colors,
      budget_min: styleProfile.budget_min,
      budget_max: styleProfile.budget_max,
    } : {};
    const systemPrompt = `You are Wishly's shopping and gift-planning assistant. Help users brainstorm product types, compare features, and refine what to search for. Use web search for timely product discovery and cite the source URLs when available. Search results are discovery leads, not verified live offers: never claim a price, stock, seller quality, delivery, exact variant, or fit is verified from search snippets alone. Direct users to Wishly's retailer offers for current listing checks. For fashion suggestions, use the user's actual size, preferred size, allowed alternatives, and preferred fit as distinct preferences. Respect men's, women's, and unisex sizing contexts; men's and women's shoe sizes are not interchangeable. Never convert sizes with a universal rule when a manufacturer chart is unavailable. If size or fit evidence is missing, say so and recommend checking the brand chart; never claim a fit or stock match. Never invent product listings, prices, stock, sellers, ratings, delivery, or retailer URLs. Treat the user's budget as guidance, not a current price quote. Measurements are private and intentionally excluded. Size and style context: ${JSON.stringify(safeStyle).slice(0, 8000)}`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: Deno.env.get("OPENROUTER_MODEL") || "openai/gpt-4o-mini",
        tools: [{ type: "openrouter:web_search", parameters: { engine: "exa", max_results: 5, max_total_results: 10, max_uses: 2, search_context_size: "low" } }],
        max_tool_calls: 4,
        messages: [
          { role: "system", content: systemPrompt },
          ...(Array.isArray(history) ? history.slice(-10) : []).filter((h: any) => (h?.role === "user" || h?.role === "assistant") && typeof h?.content === "string").map((h: any) => ({ role: h.role, content: h.content.slice(0, 2000) })),
          { role: "user", content: message },
        ],
      }),
    });

    if (!response.ok) {
      const message = response.status === 401
        ? "OpenRouter rejected its API key. Check OPENROUTER_API_KEY in Supabase Edge Function secrets."
        : response.status === 402
          ? "OpenRouter has insufficient credits to answer this request."
          : response.status === 403
            ? "The selected OpenRouter model is not available to this account."
            : "The assistant is temporarily unavailable through OpenRouter.";
      return new Response(JSON.stringify({ error: message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 502,
      });
    }
    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) throw new Error("Empty assistant response");

    return new Response(
      JSON.stringify({ content: reply, suggestions: [] }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch {
    return new Response(JSON.stringify({ error: "Could not complete the assistant request." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
