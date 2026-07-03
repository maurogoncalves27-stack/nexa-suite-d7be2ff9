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

async function verifyVideo(
  videoId: string,
  apiKey: string,
): Promise<{ exists: boolean; live: boolean; embeddable: boolean | null; title?: string }> {
  try {
    const r = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails,status&id=${videoId}&key=${apiKey}`,
    );
    const d = await r.json();
    const item = d.items?.[0];
    if (!item) return { exists: false, live: false, embeddable: null };
    const isLive = item.snippet?.liveBroadcastContent === "live" ||
      (!!item.liveStreamingDetails?.actualStartTime && !item.liveStreamingDetails?.actualEndTime);
    return {
      exists: true,
      live: isLive,
      embeddable: typeof item.status?.embeddable === "boolean" ? item.status.embeddable : null,
      title: item.snippet?.title,
    };
  } catch {
    return { exists: false, live: false, embeddable: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const apiKey = Deno.env.get("YOUTUBE_API_KEY") || "";
    const url = new URL(req.url);
    let body: { channelId?: string; videoId?: string } = {};
    if (req.method !== "GET") {
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    }
    const channelId = body.channelId || url.searchParams.get("channelId") || DEFAULT_CHANNEL;
    const directVideoId = body.videoId || url.searchParams.get("videoId") || "";

    if (directVideoId && apiKey) {
      const v = await verifyVideo(directVideoId, apiKey);
      return new Response(
        JSON.stringify({
          exists: v.exists,
          live: v.live,
          videoId: directVideoId,
          title: v.title || null,
          embeddable: v.embeddable,
          blocked: v.embeddable === false,
          source: "video-api",
        }),
        { headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // 1) Scrape /live — mais rápido/atualizado do que search API
    const scrapedId = await scrapeLiveVideoId(channelId);
    if (scrapedId && apiKey) {
      const v = await verifyVideo(scrapedId, apiKey);
      if (v.live) {
        return new Response(
          JSON.stringify({
            live: true,
            videoId: scrapedId,
            title: v.title,
            channelId,
            embeddable: v.embeddable,
            blocked: v.embeddable === false,
            source: "scrape",
          }),
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
          embeddable: null,
          blocked: false,
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
