// Google Reviews Sync — Places API (New) via Google Maps connector gateway
// Fetches Google rating + latest reviews for EACH (store × brand) combination.
// Stores aggregate rating in store_brand_google and individual reviews in customer_reviews.
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
}
interface Brand {
  id: string;
  name: string;
}

async function searchPlaceId(brandName: string, store: Store): Promise<string | null> {
  const query = [brandName, store.name, store.address, store.city ?? "Brasília, DF"]
    .filter(Boolean)
    .join(", ");
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
  const p = data?.places?.[0];
  if (p) console.log("searchText matched", brandName, store.name, "->", p.displayName?.text, p.formattedAddress);
  return p?.id ?? null;
}

async function fetchPlace(placeId: string) {
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

    // Real customer-facing stores only (excluir Escritório, Estoque Central, Fábrica).
    const EXCLUDE = new Set(["ESCRITÓRIO", "ESCRITORIO", "ESTOQUE CENTRAL", "FABRICA", "FÁBRICA", "iFood Homologação"]);

    let storesQ = supabase
      .from("stores")
      .select("id,name,address,city")
      .eq("is_active", true)
      .eq("is_virtual", false);
    if (storeIdFilter) storesQ = storesQ.eq("id", storeIdFilter);

    const [{ data: storesRaw, error: sErr }, { data: brands, error: bErr }] = await Promise.all([
      storesQ,
      supabase.from("brands").select("id,name").eq("is_active", true),
    ]);
    if (sErr) throw sErr;
    if (bErr) throw bErr;

    const stores = ((storesRaw ?? []) as Store[]).filter((s) => !EXCLUDE.has(s.name.toUpperCase()));
    const brandList = (brands ?? []) as Brand[];

    // Load existing mappings.
    const { data: existing } = await supabase.from("store_brand_google").select("store_id,brand_id,place_id");
    const mapKey = (s: string, b: string) => `${s}::${b}`;
    const placeIdMap = new Map<string, string | null>();
    for (const r of existing ?? []) placeIdMap.set(mapKey(r.store_id, r.brand_id), r.place_id);

    const results: any[] = [];
    let totalUpserted = 0;

    for (const store of stores) {
      for (const brand of brandList) {
        const key = mapKey(store.id, brand.id);
        let placeId = placeIdMap.get(key) ?? null;

        // Detect if missing (or when action=detect, always re-detect).
        if (!placeId || action === "detect") {
          placeId = await searchPlaceId(brand.name, store);
          if (!placeId) {
            await supabase.from("store_brand_google").upsert(
              { store_id: store.id, brand_id: brand.id, place_id: null, synced_at: new Date().toISOString() },
              { onConflict: "store_id,brand_id" },
            );
            results.push({ store: store.name, brand: brand.name, status: "not_found" });
            continue;
          }
        }

        if (action === "detect") {
          await supabase.from("store_brand_google").upsert(
            { store_id: store.id, brand_id: brand.id, place_id: placeId, synced_at: new Date().toISOString() },
            { onConflict: "store_id,brand_id" },
          );
          results.push({ store: store.name, brand: brand.name, status: "detected", place_id: placeId });
          continue;
        }

        // action = sync — fetch rating + reviews.
        try {
          const place = await fetchPlace(placeId);
          const rating = typeof place?.rating === "number" ? place.rating : null;
          const total = typeof place?.userRatingCount === "number" ? place.userRatingCount : null;
          const reviews = place?.reviews ?? [];

          await supabase.from("store_brand_google").upsert(
            {
              store_id: store.id,
              brand_id: brand.id,
              place_id: placeId,
              avg_rating: rating,
              total_ratings: total,
              synced_at: new Date().toISOString(),
            },
            { onConflict: "store_id,brand_id" },
          );

          let upserted = 0;
          for (const r of reviews) {
            const externalId = String(r.name ?? "").split("/").pop() ?? null;
            if (!externalId) continue;
            const { error: upErr } = await supabase.from("customer_reviews").upsert(
              {
                source: "google",
                external_id: externalId,
                external_url: r.googleMapsUri ?? null,
                rating: typeof r.rating === "number" ? r.rating : null,
                comment: r.originalText?.text ?? r.text?.text ?? null,
                customer_name: r.authorAttribution?.displayName ?? null,
                store_id: store.id,
                brand_id: brand.id,
                status: "novo",
                published_at: r.publishTime ?? new Date().toISOString(),
              },
              { onConflict: "source,external_id" },
            );
            if (upErr) console.error("upsert review", upErr);
            else upserted++;
          }
          totalUpserted += upserted;
          results.push({
            store: store.name,
            brand: brand.name,
            status: "ok",
            rating,
            total_ratings: total,
            reviews_fetched: reviews.length,
            upserted,
          });
        } catch (err) {
          console.error("sync error", store.name, brand.name, err);
          results.push({ store: store.name, brand: brand.name, status: "error", message: (err as Error).message });
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, action, total_upserted: totalUpserted, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("google-reviews-sync fatal", err);
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
