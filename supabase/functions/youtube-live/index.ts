// Busca a live ativa de um canal do YouTube
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_CHANNEL = "UCZiYbVptd3PVPf4f6eR6UaQ"; // CazéTV (@CazeTV)

async function scrapeLiveVideoId(channelId: string): Promise<string | null> {
  try {
    const r = await fetch(`https://www.youtube.com/channel/${channelId}/live`, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8" },
    });
    const html = await r.text();
    const m = html.match(/"videoId":"([A-Za-z0-9_-]{11})"/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

async function verifyLive(videoId: string, apiKey: string): Promise<{ live: boolean; title?: string }> {
  try {
    const r = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${videoId}&key=${apiKey}`,
    );
    const d = await r.json();
    const item = d.items?.[0];
    if (!item) return { live: false };
    const isLive = item.snippet?.liveBroadcastContent === "live";
    return { live: isLive, title: item.snippet?.title };
  } catch {
    return { live: false };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const apiKey = Deno.env.get("YOUTUBE_API_KEY") || "";
    const url = new URL(req.url);
    const channelId = url.searchParams.get("channelId") || DEFAULT_CHANNEL;

    // 1) Scrape /live — mais rápido/atualizado do que search API
    const scrapedId = await scrapeLiveVideoId(channelId);
    if (scrapedId && apiKey) {
      const v = await verifyLive(scrapedId, apiKey);
      if (v.live) {
        return new Response(
          JSON.stringify({ live: true, videoId: scrapedId, title: v.title, channelId, source: "scrape" }),
          { headers: { ...CORS, "Content-Type": "application/json" } },
        );
      }
    } else if (scrapedId) {
      // sem API key para verificar, devolve mesmo assim (player mostra se estiver ao vivo)
      return new Response(
        JSON.stringify({ live: true, videoId: scrapedId, title: null, channelId, source: "scrape-unverified" }),
        { headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // 2) Fallback: search API (pode ter atraso de indexação)
    if (apiKey) {
      const searchUrl =
        `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}` +
        `&eventType=live&type=video&maxResults=1&key=${apiKey}`;
      const r = await fetch(searchUrl);
      const data = await r.json();
      const item = data.items?.[0];
      const videoId = item?.id?.videoId || null;
      return new Response(
        JSON.stringify({
          live: !!videoId,
          videoId,
          title: item?.snippet?.title || null,
          channelId,
          source: "search-api",
        }),
        { headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ live: false, videoId: null, channelId, source: "none" }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message, live: false }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
