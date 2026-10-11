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
    const apiKey = Deno.env.get("OPENAI_API_KEY");

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "The assistant is not configured." }), {
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
    const systemPrompt = `You are Wishly's shopping and gift-planning assistant. Help users brainstorm product types, compare features, and refine what to search for. For fashion suggestions, use the user's actual size, preferred size, allowed alternatives, and preferred fit as distinct preferences. Respect men's, women's, and unisex sizing contexts; men's and women's shoe sizes are not interchangeable. Never convert sizes with a universal rule when a manufacturer chart is unavailable. If size or fit evidence is missing, say so and recommend checking the brand chart; never claim a fit or stock match. You do not have live retailer or inventory access. Never invent product listings, prices, stock, sellers, ratings, delivery, or retailer URLs. When a user wants to buy a specific item, direct them to Wishly's product search to check connected sources. Treat the user's budget as guidance, not a current price quote. Measurements are private and intentionally excluded. Size and style context: ${JSON.stringify(safeStyle).slice(0, 8000)}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...(Array.isArray(history) ? history.slice(-10) : []).filter((h: any) => (h?.role === "user" || h?.role === "assistant") && typeof h?.content === "string").map((h: any) => ({ role: h.role, content: h.content.slice(0, 2000) })),
          { role: "user", content: message },
        ],
      }),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: "The assistant is temporarily unavailable." }), {
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
