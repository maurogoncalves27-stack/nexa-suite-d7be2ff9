// Busca a live ativa de um canal do YouTube
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_CHANNEL = "UCd0Ya-h5tXvvwK1_Q_urMkw"; // CazéTV

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const apiKey = Deno.env.get("YOUTUBE_API_KEY");
    if (!apiKey) throw new Error("YOUTUBE_API_KEY não configurada");

    const url = new URL(req.url);
    const channelId = url.searchParams.get("channelId") || DEFAULT_CHANNEL;

    const searchUrl =
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}` +
      `&eventType=live&type=video&maxResults=1&key=${apiKey}`;
    const r = await fetch(searchUrl);
    const data = await r.json();
    if (!r.ok) {
      return new Response(JSON.stringify({ error: data?.error?.message || "erro youtube", live: false }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const item = data.items?.[0];
    const videoId = item?.id?.videoId || null;
    return new Response(
      JSON.stringify({
        live: !!videoId,
        videoId,
        title: item?.snippet?.title || null,
        channelId,
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message, live: false }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
