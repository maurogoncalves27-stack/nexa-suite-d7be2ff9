// Google Reviews Sync — Places API (New) via Google Maps connector gateway
// - action="detect": tenta achar place_id de lojas sem place_id (via searchText)
// - action="sync"  : busca as últimas 5 reviews de cada loja com place_id e upserta em customer_reviews
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const GMAPS_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const gwHeaders = (extra: Record<string, string> = {}) => ({
  Authorization: `Bearer ${LOVABLE_API_KEY}`,
  "X-Connection-Api-Key": GMAPS_KEY,
  "Content-Type": "application/json",
  ...extra,
});

interface Store {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  google_place_id: string | null;
  brand_id: string | null;
}

async function searchPlaceId(store: Store): Promise<string | null> {
  const query = [store.name, store.address, store.city].filter(Boolean).join(", ");
  const res = await fetch(`${GATEWAY}/places/v1/places:searchText`, {
    method: "POST",
    headers: gwHeaders({ "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress" }),
    body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
  });
  if (!res.ok) {
    console.error("searchText failed", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  return data?.places?.[0]?.id ?? null;
}

async function fetchReviews(placeId: string) {
  const res = await fetch(`${GATEWAY}/places/v1/places/${placeId}?languageCode=pt-BR`, {
    method: "GET",
    headers: gwHeaders({ "X-Goog-FieldMask": "id,displayName,rating,userRatingCount,reviews" }),
  });
  if (!res.ok) throw new Error(`places.get ${res.status}: ${await res.text()}`);
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = (body.action ?? "sync") as "sync" | "detect";
    const storeIdFilter = body.store_id as string | undefined;

    let query = supabase
      .from("stores")
      .select("id,name,address,city,google_place_id,brand_id")
      .eq("is_active", true)
      .eq("is_virtual", false);
    if (storeIdFilter) query = query.eq("id", storeIdFilter);

    const { data: stores, error } = await query;
    if (error) throw error;

    const results: any[] = [];

    if (action === "detect") {
      for (const s of (stores ?? []) as Store[]) {
        if (s.google_place_id) {
          results.push({ store: s.name, status: "skipped", place_id: s.google_place_id });
          continue;
        }
        const placeId = await searchPlaceId(s);
        if (placeId) {
          await supabase.from("stores").update({ google_place_id: placeId }).eq("id", s.id);
          results.push({ store: s.name, status: "detected", place_id: placeId });
        } else {
          results.push({ store: s.name, status: "not_found" });
        }
      }
      return new Response(JSON.stringify({ ok: true, action, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // action = sync
    let totalUpserted = 0;
    for (const s of (stores ?? []) as Store[]) {
      if (!s.google_place_id) {
        results.push({ store: s.name, status: "no_place_id" });
        continue;
      }
      try {
        const place = await fetchReviews(s.google_place_id);
        const reviews = place?.reviews ?? [];
        let upserted = 0;
        for (const r of reviews) {
          // r.name = "places/{placeId}/reviews/{reviewId}"
          const externalId = String(r.name ?? "").split("/").pop() ?? null;
          if (!externalId) continue;
          const publishedAt = r.publishTime ?? new Date().toISOString();
          const commentText = r.originalText?.text ?? r.text?.text ?? null;
          const authorName = r.authorAttribution?.displayName ?? null;
          const rating = typeof r.rating === "number" ? r.rating : null;

          const { error: upErr } = await supabase.from("customer_reviews").upsert(
            {
              source: "google",
              external_id: externalId,
              external_url: r.googleMapsUri ?? null,
              rating,
              comment: commentText,
              customer_name: authorName,
              store_id: s.id,
              brand_id: s.brand_id,
              status: "novo",
              published_at: publishedAt,
            },
            { onConflict: "source,external_id" }
          );
          if (upErr) console.error("upsert error", upErr);
          else upserted++;
        }
        totalUpserted += upserted;
        results.push({
          store: s.name,
          status: "ok",
          reviews_fetched: reviews.length,
          upserted,
          overall_rating: place?.rating,
          total_ratings: place?.userRatingCount,
        });
      } catch (err) {
        console.error("sync error for", s.name, err);
        results.push({ store: s.name, status: "error", message: (err as Error).message });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, action, total_upserted: totalUpserted, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("google-reviews-sync fatal", err);
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
