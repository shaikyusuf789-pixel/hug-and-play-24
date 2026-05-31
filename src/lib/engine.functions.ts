import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const APIFY_BASE = "https://api.apify.com/v2";

// Apify actor IDs (slugs use ~ in API)
const CHANNEL_SCRAPER = "streamers~youtube-scraper";
const TRANSCRIPT_ACTOR = "lume~yt-transcripts-summary";

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
  if (!key) throw new Error("OPENAI_API_KEY not configured in secrets");

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

export const runIdeaEngine = createServerFn({ method: "POST" })
  .inputValidator(z.object({ sourceId: z.string().uuid().optional() }).optional())
  .handler(async ({ data: inputData }) => {
    console.log("Starting Idea Engine run...");
    const token = process.env.APIFY_API_TOKEN;
    if (!token) throw new Error("APIFY_API_TOKEN not configured");

    let query = supabaseAdmin.from("sources_master").select("*");
    if (inputData?.sourceId) {
      query = query.eq("id", inputData.sourceId);
    }

    const { data: sources, error: srcErr } = await query;
    if (srcErr) throw srcErr;
    if (!sources || sources.length === 0) return { processed: 0, message: "No YouTube sources configured." };

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
          token,
        );

        console.log(`Apify response for ${source.channel_name}:`, JSON.stringify(videos).slice(0, 1000));
        
        // Handle nested structures and find the video list
        let actualVideos: any[] = [];
        if (videos && Array.isArray(videos)) {
          // Check for the specific structure returned by the streamers/youtube-channel-scraper
          actualVideos = videos;
        }

        console.log(`Processing ${actualVideos.length} potential videos for ${source.channel_name}`);
        
        // Take 3 videos per source as requested
        const videoPromises = actualVideos.slice(0, 3).map(async (v) => {
          try {
            const videoUrl: string = v.url || v.videoUrl || v.link;
            if (!videoUrl) {
              console.log("Skipping item without valid video URL:", v.title || v.id);
              return null;
            }

            // dedupe
            const { data: existing } = await supabaseAdmin
              .from("raw_content")
              .select("id")
              .eq("video_url", videoUrl)
              .maybeSingle();
            
            if (existing) {
              console.log(`Video already exists: ${v.title}`);
              return null;
            }

            console.log(`Processing basic info for video: ${v.title} (${videoUrl})`);

            // Fix for relative dates
            let pubDate = v.date || v.publishedAt || null;
            if (pubDate && isNaN(Date.parse(pubDate))) {
              pubDate = null; 
            }

            const { error: insErr } = await supabaseAdmin.from("raw_content").insert({
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

    return { processed: totalProcessed, errors, sources: sources.length };
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
    let query = supabaseAdmin
      .from("raw_content")
      .select("*, sources_master(channel_name)")
      .order("created_at", { ascending: false });

    if (data.status) {
      query = query.eq("status", data.status);
    }

    const { data: ideas, error } = await query;
    if (error) throw error;
    return { ideas: (ideas || []) as any[] };
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
    return (data?.value || { enabled: false, interval_hrs: 1, last_run: null }) as {
      enabled: boolean;
      interval_hrs: number;
      last_run: string | null;
    };
  });

export const updateAutoRunSettings = createServerFn({ method: "POST" })
  .inputValidator(z.object({ enabled: z.boolean(), interval_hrs: z.number() }))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert({ key: "engine_auto_run", value: data }, { onConflict: "key" });
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
    console.log(`Approving and processing idea: ${id}`);
    const token = process.env.APIFY_API_TOKEN;
    if (!token) throw new Error("APIFY_API_TOKEN not configured");

    // 1. Set status to Processing
    await supabaseAdmin.from("raw_content").update({ status: "Processing" }).eq("id", id);

    try {
      // 2. Fetch the idea details
      const { data: idea, error: fetchErr } = await supabaseAdmin
        .from("raw_content")
        .select("*, sources_master(channel_name)")
        .eq("id", id)
        .single();
      if (fetchErr || !idea) throw new Error("Idea not found");

      // 3. Fetch Transcript
      let transcript = "";
      let transcriptData: any = null;
      try {
        const tr = await apifyRun(TRANSCRIPT_ACTOR, { urls: [idea.video_url], language: "English" }, token);
        transcriptData = tr?.[0];
        // The lume/yt-transcripts-summary actor returns a 'summary' field
        const rawSummary = transcriptData?.summary || "";
        // If it also provides a transcript field, we use it, otherwise we just use the summary
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
        })
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
    const { data, error } = await supabaseAdmin
      .from("scripts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw error;
    return { scripts: data || [] };
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
