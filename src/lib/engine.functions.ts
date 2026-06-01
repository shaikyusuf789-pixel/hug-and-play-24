import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const APIFY_BASE = "https://api.apify.com/v2";
const TRANSCRIPT_ACTOR = "lume~yt-transcripts-summary";

type ScrapedVideo = {
  title: string;
  videoUrl: string;
  videoId: string;
  publishedAt: string | null;
  thumbnailUrl: string | null;
};

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function extractChannelId(url: string, html: string) {
  const direct = url.match(/youtube\.com\/channel\/([a-zA-Z0-9_-]+)/)?.[1];
  if (direct) return direct;

  return (
    html.match(/"channelId":"(UC[a-zA-Z0-9_-]{20,})"/)?.[1] ||
    html.match(/"externalId":"(UC[a-zA-Z0-9_-]{20,})"/)?.[1] ||
    html.match(/<meta itemprop="channelId" content="(UC[a-zA-Z0-9_-]{20,})">/)?.[1] ||
    null
  );
}

async function scrapeYoutubeRss(sourceUrl: string, limit: number = 10): Promise<ScrapedVideo[]> {
  // Browser-like headers + consent cookie so EU/region gates don't bounce us to a consent page
  const browserHeaders = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cookie": "CONSENT=YES+cb.20210328-17-p0.en+FX+000",
  };

  // 1) Try to extract channel id directly from URL
  let channelId = sourceUrl.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{20,})/)?.[1] || null;

  // 2) Otherwise fetch the channel page and extract from HTML
  if (!channelId) {
    const pageRes = await fetch(sourceUrl, { headers: browserHeaders, redirect: "follow" });
    if (!pageRes.ok) {
      throw new Error(`YouTube page returned ${pageRes.status}`);
    }
    const html = await pageRes.text();
    channelId =
      html.match(/"channelId":"(UC[a-zA-Z0-9_-]{20,})"/)?.[1] ||
      html.match(/"externalId":"(UC[a-zA-Z0-9_-]{20,})"/)?.[1] ||
      html.match(/<meta itemprop="(?:channelId|identifier)" content="(UC[a-zA-Z0-9_-]{20,})"/)?.[1] ||
      html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{20,})"/)?.[1] ||
      html.match(/browse_id=(UC[a-zA-Z0-9_-]{20,})/)?.[1] ||
      null;
  }

  if (!channelId) {
    throw new Error("Could not detect YouTube channel id from URL or page");
  }

  const feedRes = await fetch(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
    { headers: browserHeaders },
  );

  if (!feedRes.ok) {
    throw new Error(`YouTube feed returned ${feedRes.status}`);
  }

  const xml = await feedRes.text();
  const safeLimit = Math.max(1, Math.min(limit, 50));
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, safeLimit).map(([, entry]) => {
    const videoId = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1]?.trim();
    const title = decodeXml(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "Untitled video");
    const publishedAt = entry.match(/<published>(.*?)<\/published>/)?.[1]?.trim() || null;
    const thumbnailUrl = entry.match(/<media:thumbnail url="(.*?)"/)?.[1] || null;
    const link = entry.match(/<link rel="alternate" href="(.*?)"/)?.[1];

    return {
      title,
      videoUrl: decodeXml(link || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : sourceUrl)),
      videoId: videoId || "",
      publishedAt,
      thumbnailUrl: thumbnailUrl ? decodeXml(thumbnailUrl) : null,
    };
  }).filter((video) => video.videoUrl.includes("youtube.com/watch") && video.videoId);
}

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

async function callAI(prompt: string, system: string) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not configured in project secrets");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${errorText.slice(0, 300)}`);
  }
  
  const data = await res.json();
  const content = data.choices[0].message.content;
  try {
    return JSON.parse(content);
  } catch (e) {
    console.error("Failed to parse AI JSON:", content);
    throw new Error("AI returned invalid JSON format");
  }
}

const SYSTEM_PROMPT = `You are an expert YouTube content strategist specializing in Indian educational and government exam preparation content (SSC, UPSC, RRB, APPSC, Banking).

You analyze competitor videos and generate actionable content intelligence to help creators produce better-performing videos on the same topic.

Always respond in valid JSON format only. No explanation text outside the JSON. Be specific, punchy, and use Indian education context.

JSON schema:
{
  "proposed_title": "Catchy improved title (max 70 chars)",
  "new_thumbnail_outline": "Short visual concept for the thumbnail",
  "target_audience": "Who is this for",
  "core_hooks": ["hook 1", "hook 2", "hook 3"],
  "summary_points": ["point 1", "point 2", "point 3", "point 4", "point 5", "point 6", "point 7"],
  "video_outline": { "hook": "2-3 hook lines", "intro": "intro", "body": "10-15 line body outline" }
}
Always ensure summary_points has at least 5-7 key takeaways.`;

export async function runIdeaEngineCore(inputData?: { sourceId?: string; videosLimit?: number }) {
    console.log("Starting Idea Engine run...", inputData);



    // Resolve videos-per-run: explicit arg → setting → default 10
    let videosLimit = inputData?.videosLimit;
    if (!videosLimit) {
      const { data: cfg } = await supabaseAdmin
        .from("app_settings")
        .select("value")
        .eq("key", "engine_auto_run")
        .maybeSingle();
      const v = (cfg?.value as any)?.videos_per_run;
      videosLimit = typeof v === "number" ? v : 10;
    }

    let sourceQuery = supabaseAdmin
      .from("sources_master")
      .select("id, channel_name, source_url, type")
      .order("created_at", { ascending: false });

    if (inputData?.sourceId) {
      sourceQuery = sourceQuery.eq("id", inputData.sourceId);
    }

    const { data: sources, error: sourceError } = await sourceQuery;
    if (sourceError) {
      console.error("Failed to load sources for Idea Engine:", sourceError);
      return { processed: 0, failed: 1, message: sourceError.message, perChannel: [] as any[] };
    }

    if (!sources?.length) {
      return { processed: 0, failed: 0, message: "No sources configured. Add YouTube sources first.", perChannel: [] };
    }

    let processed = 0;
    const failures: string[] = [];
    const perChannel: { channel: string; inserted: number; error?: string }[] = [];

    for (const source of sources) {
      try {
        const videos = await scrapeYoutubeRss(source.source_url, videosLimit);
        if (!videos.length) {
          perChannel.push({ channel: source.channel_name, inserted: 0 });
          continue;
        }

        const videoIds = videos.map((video) => video.videoId).filter(Boolean);
        const { data: existing, error: existingError } = await supabaseAdmin
          .from("raw_content")
          .select("video_id")
          .in("video_id", videoIds);

        if (existingError) throw existingError;

        const existingIds = new Set((existing || []).map((row) => row.video_id));
        const rows = videos
          .filter((video) => video.videoId && !existingIds.has(video.videoId))
          .map((video) => ({
            source_id: source.id,
            original_title: video.title,
            video_url: video.videoUrl,
            video_id: video.videoId,
            published_at: video.publishedAt,
            published_date: video.publishedAt ? new Date(video.publishedAt).toLocaleDateString("en-IN") : null,
            thumbnail_url: video.thumbnailUrl,
            date_extracted: new Date().toISOString(),
            status: "Pending",
          }));

        if (!rows.length) {
          perChannel.push({ channel: source.channel_name, inserted: 0 });
          continue;
        }

        const { error: insertError } = await supabaseAdmin.from("raw_content").insert(rows);
        if (insertError) throw insertError;

        processed += rows.length;
        perChannel.push({ channel: source.channel_name, inserted: rows.length });
      } catch (error: any) {
        const errMsg = error?.message || "scrape failed";
        const message = `${source.channel_name}: ${errMsg}`;
        failures.push(message);
        perChannel.push({ channel: source.channel_name, inserted: 0, error: errMsg });
        console.warn("Idea Engine source failed:", message);
      }
    }

    return {
      processed,
      failed: failures.length,
      perChannel,
      videosLimit,
      message: failures.length
        ? `Processed ${processed} new ideas from ${sources.length - failures.length}/${sources.length} channels. ${failures.length} failed.`
        : `Processed ${processed} new ideas from ${sources.length} channel(s).`,
    };
  });


const SourceInput = z.object({
  type: z.string().default("youtube"),
  channel_name: z.string().min(1),
  source_url: z.string().url(),
});

export const addSource = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SourceInput.parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("sources_master").upsert(data, { onConflict: 'source_url', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSource = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("sources_master").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkAddSources = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.array(SourceInput).parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("sources_master").upsert(data, { onConflict: 'source_url', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { ok: true, count: data.length };
  });

export const getIdeas = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ status: z.string().optional() }).parse(d))
  .handler(async ({ data }) => {
    console.log("[getIdeas] Fetching ideas for status:", data.status || "all");
    let query = supabaseAdmin
      .from("raw_content")
      .select("*");

    if (data.status) {
      query = query.eq("status", data.status);
    }

    const { data: ideas, error } = await query;
    if (error) {
      console.error("[getIdeas] Error:", error);
      throw error;
    }
    
    // Sort manually if needed or just use simple order
    const sorted = (ideas || []).sort((a, b) => 
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

    console.log(`[getIdeas] Returning ${sorted.length} ideas`);
    return { ideas: sorted as any[] };
  });

export const updateIdeaStatus = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().uuid(), status: z.string() }))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("raw_content")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const getAutoRunSettings = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "engine_auto_run")
      .maybeSingle();
    if (error) throw error;
    const v = (data?.value || {}) as any;
    return {
      enabled: v.enabled ?? false,
      interval_hrs: v.interval_hrs ?? 1,
      videos_per_run: v.videos_per_run ?? 10,
      last_run: v.last_run ?? null,
    } as {
      enabled: boolean;
      interval_hrs: number;
      videos_per_run: number;
      last_run: string | null;
    };
  });

export const updateAutoRunSettings = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      enabled: z.boolean(),
      interval_hrs: z.number().min(1).max(24),
      videos_per_run: z.number().int().min(1).max(50).optional(),
    }),
  )
  .handler(async ({ data }) => {
    // Merge with existing to preserve last_run and other fields
    const { data: current } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "engine_auto_run")
      .maybeSingle();
    const merged = {
      ...((current?.value as any) || {}),
      enabled: data.enabled,
      interval_hrs: data.interval_hrs,
      ...(data.videos_per_run !== undefined ? { videos_per_run: data.videos_per_run } : {}),
    };
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert({ key: "engine_auto_run", value: merged }, { onConflict: "key" });
    if (error) throw error;
    return { ok: true };
  });

export const updateLastRunTimestamp = createServerFn({ method: "POST" })
  .handler(async () => {
    const { data: current } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "engine_auto_run")
      .single();
    
    const newValue = { ...(current?.value as any || {}), last_run: new Date().toISOString() };
    await supabaseAdmin.from("app_settings").update({ value: newValue }).eq("key", "engine_auto_run");
    return { ok: true };
  });

export const approveAndProcessIdea = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data: { id } }) => {
    console.log(`Approving and processing idea (Fallback to ServerFn): ${id}`);
    const token = process.env.APIFY_API_TOKEN;
    if (!token) throw new Error("APIFY_API_TOKEN not configured in project secrets");

    // 1. Set status to Processing
    try {
      await supabaseAdmin.from("raw_content").update({ 
        status: "Processing"
      } as any).eq("id", id);
    } catch (e) {
      console.warn("Failed to update status to Processing, continuing...", e);
    }

    try {
      // Update progress
      console.log(`[${id}] Fetching transcript...`);

      // 2. Fetch the idea details
      const { data: idea, error: fetchErr } = await supabaseAdmin
        .from("raw_content")
        .select("*, sources_master!fk_raw_content_source(channel_name)")
        .eq("id", id)
        .single();
      if (fetchErr || !idea) throw new Error("Idea not found");

      // 3. Fetch Transcript
      let transcript = "";
      try {
        const tr = await apifyRun(TRANSCRIPT_ACTOR, { urls: [idea.video_url], language: "English" }, token);
        const transcriptData = tr?.[0];
        const rawSummary = transcriptData?.summary || "";
        const rawTranscript = transcriptData?.transcript || "";
        
        if (rawSummary && rawTranscript) {
          transcript = `SUMMARY:\n${rawSummary}\n\nTRANSCRIPT:\n${rawTranscript}`;
        } else {
          transcript = rawSummary || rawTranscript || "";
        }
        transcript = transcript.trim().slice(0, 30000);
      } catch (e) {
        console.warn(`Transcript failed for ${idea.original_title}`, e);
      }

      // AI Analysis
      console.log(`[${id}] Starting AI analysis...`);


      // 4. Call AI for new content
      const aiInput = `Channel: ${idea.sources_master?.channel_name || "Unknown"}
Original Title: ${idea.original_title}
Views: ${idea.views ?? "N/A"}

Transcript / Description:
${transcript || "(no transcript available)"}`;

      console.log(`Calling AI for detailed analysis: ${idea.original_title}`);
      const ai = await callAI(aiInput, SYSTEM_PROMPT);

      // 5. Update DB
      const { error: updErr } = await supabaseAdmin
        .from("raw_content")
        .update({
          status: "Approved",
          original_summary: transcript,
          proposed_title: ai.proposed_title,
          new_thumbnail_outline: ai.new_thumbnail_outline,
          target_audience: ai.target_audience,
          core_hooks: ai.core_hooks ?? [],
          summary_points: ai.summary_points?.slice(0, 7) ?? [],
          video_outline: ai.video_outline ?? {},
        } as any)
        .eq("id", id);

      if (updErr) throw updErr;

      return { ok: true };
    } catch (e: any) {
      console.error(`Failed to process approved idea ${id}:`, e);
      await supabaseAdmin.from("raw_content").update({ status: "Pending" }).eq("id", id);
      throw e;
    }
  });



export const saveScript = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    idea_id: z.string().uuid().optional(),
    title: z.string(),
    content: z.string(),
    word_count: z.number().optional(),
    video_type: z.string().optional(),
    model: z.string().optional(),
  }))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("scripts").insert(data);
    if (error) throw error;
    return { ok: true };
  });

export const getRecentScripts = createServerFn({ method: "GET" })
  .handler(async () => {
    console.log("[getRecentScripts] Fetching...");
    const { data, error } = await supabaseAdmin
      .from("scripts")
      .select("*");
    
    if (error) {
      console.error("[getRecentScripts] Error:", error);
      throw error;
    }
    
    const sorted = (data || []).sort((a, b) => 
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

    console.log(`[getRecentScripts] Returning ${sorted.length} scripts`);
    return { scripts: sorted.slice(0, 10) };
  });

export const updateScript = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    id: z.string().uuid(),
    content: z.string(),
  }))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("scripts")
      .update({ content: data.content, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const saveChunks = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    script_id: z.string().uuid(),
    chunks: z.array(z.string()),
  }))
  .handler(async ({ data }) => {
    // Delete existing chunks for this script first
    await supabaseAdmin.from("script_chunks").delete().eq("script_id", data.script_id);
    
    const chunksToInsert = data.chunks.map((content, index) => ({
      script_id: data.script_id,
      chunk_index: index,
      content,
      word_count: content.trim().split(/\s+/).length,
      status: 'PENDING'
    }));

    const { error } = await supabaseAdmin.from("script_chunks").insert(chunksToInsert);
    if (error) throw error;
    return { ok: true };
  });

export const updateChunk = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    id: z.string().uuid(),
    content: z.string(),
  }))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("script_chunks")
      .update({ content: data.content, word_count: data.content.trim().split(/\s+/).length, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const getYoutubeSeo = createServerFn({ method: "GET" })
  .inputValidator(z.object({ script_id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { data: seo, error } = await supabaseAdmin
      .from("youtube_seo")
      .select("*")
      .eq("script_id", data.script_id)
      .maybeSingle();
    if (error) throw error;
    return { seo };
  });

export const saveYoutubeSeo = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    script_id: z.string().uuid(),
    title_variations: z.array(z.string()).optional(),
    selected_title: z.string().optional(),
    tags: z.array(z.string()).optional(),
    description: z.string().optional(),
    thumbnail_lines: z.any().optional(),
    thumbnail_prompt: z.string().optional(),
    thumbnail_url: z.string().optional(),
  }))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("youtube_seo")
      .upsert(data, { onConflict: 'script_id' });
    if (error) throw error;
    return { ok: true };
  });

export const getDashboardStats = createServerFn({ method: "GET" })
  .handler(async () => {
    console.log("[getDashboardStats] Fetching counts...");
    const [total, pending, approved, priority, scriptDone, audioDone] = await Promise.all([
      supabaseAdmin.from("raw_content").select("*", { count: "exact" }).limit(1),
      supabaseAdmin.from("raw_content").select("*", { count: "exact" }).eq("status", "Pending").limit(1),
      supabaseAdmin.from("raw_content").select("*", { count: "exact" }).eq("status", "Approved").limit(1),
      supabaseAdmin.from("raw_content").select("*", { count: "exact" }).eq("status", "Priority").limit(1),
      supabaseAdmin.from("raw_content").select("*", { count: "exact" }).eq("status", "Script Done").limit(1),
      supabaseAdmin.from("raw_content").select("*", { count: "exact" }).eq("status", "Audio Done").limit(1),
    ]);

    console.log(`[getDashboardStats] Results - Total: ${total.count}, Pending: ${pending.count}`);

    return { 
      total: total.count ?? 0, 
      pending: pending.count ?? 0,
      approved: approved.count ?? 0,
      priority: priority.count ?? 0,
      scriptDone: scriptDone.count ?? 0,
      audioDone: audioDone.count ?? 0,
    };
  });

export const getSources = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("sources_master")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  });
