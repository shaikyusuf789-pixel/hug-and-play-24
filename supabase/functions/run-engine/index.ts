import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APIFY_BASE = "https://api.apify.com/v2";
const CHANNEL_SCRAPER = "streamers~youtube-scraper";

async function apifyRun(actorId: string, input: unknown, token: string) {
  const res = await fetch(`${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items?token=${token}&clean=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify ${actorId} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return (await res.json()) as any[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { sourceId } = body;


    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apifyToken = Deno.env.get("APIFY_API_TOKEN");

    if (!apifyToken) throw new Error("APIFY_API_TOKEN not configured in secrets");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let query = supabase.from("sources_master").select("*");
    if (sourceId) {
      query = query.eq("id", sourceId);
    }

    const { data: sources, error: srcErr } = await query;
    if (srcErr) throw srcErr;
    if (!sources || sources.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: "No YouTube sources configured." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalProcessed = 0;
    const errors: string[] = [];

    for (const source of sources) {
      try {
        console.log(`Scraping channel: ${source.channel_name} (${source.source_url})`);
        const videos = await apifyRun(
          CHANNEL_SCRAPER,
          { 
            startUrls: [{ url: source.source_url }],
            downloadSubtitles: false,
            saveDescription: false,
            maxResults: 10,
          },
          apifyToken,
        );
        
        const videoPromises = (videos || []).slice(0, 3).map(async (v) => {
          try {
            const videoUrl: string = v.url || v.videoUrl || v.link;
            if (!videoUrl) return null;

            const { data: existing } = await supabase
              .from("raw_content")
              .select("id")
              .eq("video_url", videoUrl)
              .maybeSingle();
            
            if (existing) return null;

            let pubDate = v.date || v.publishedAt || null;
            if (pubDate && isNaN(Date.parse(pubDate))) pubDate = null;

            const { error: insErr } = await supabase.from("raw_content").insert({
              source_id: source.id,
              video_url: videoUrl,
              views: typeof v.viewCount === "number" ? v.viewCount : typeof v.views === "number" ? v.views : null,
              published_date: pubDate,
              duration: v.duration?.toString() ?? null,
              thumbnail_url: v.thumbnailUrl || v.thumbnail || null,
              original_title: v.title,
              status: "Pending",
            });

            if (insErr) throw insErr;
            return true;
          } catch (e: any) {
            console.error(`Failed to process video ${v.title}:`, e);
            throw e;
          }
        });

        const results = await Promise.allSettled(videoPromises);
        results.forEach((r, idx) => {
          if (r.status === "fulfilled") {
            if (r.value) totalProcessed++;
          } else {
            errors.push(`${source.channel_name} (video ${idx}): ${r.reason.message}`);
          }
        });

      } catch (e: any) {
        errors.push(`${source.channel_name}: ${e.message}`);
      }
    }

    return new Response(JSON.stringify({ processed: totalProcessed, errors, sources: sources.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
