import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APIFY_BASE = "https://api.apify.com/v2";
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

async function callAI(prompt: string, system: string, apiKey: string) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { id } = await req.json();
    if (!id) throw new Error("Missing idea ID");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apifyToken = Deno.env.get("APIFY_API_TOKEN");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!apifyToken) throw new Error("APIFY_API_TOKEN not configured in secrets");
    if (!openaiKey) throw new Error("OPENAI_API_KEY not configured in secrets");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Approving and processing idea: ${id}`);
    
    // 1. Set status to Processing
    await supabase.from("raw_content").update({ status: "Processing" }).eq("id", id);

    // 2. Fetch the idea details
    const { data: idea, error: fetchErr } = await supabase
      .from("raw_content")
      .select("*, sources_master(channel_name)")
      .eq("id", id)
      .single();
    if (fetchErr || !idea) throw new Error("Idea not found");

    // 3. Fetch Transcript
    let transcript = "";
    try {
      const tr = await apifyRun(TRANSCRIPT_ACTOR, { urls: [idea.video_url], language: "English" }, apifyToken);
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

    // 4. Call AI for new content
    const aiInput = `Channel: ${idea.sources_master?.channel_name || "Unknown"}
Original Title: ${idea.original_title}
Views: ${idea.views ?? "N/A"}

Transcript / Description:
${transcript || "(no transcript available)"}`;

    console.log(`Calling AI for detailed analysis: ${idea.original_title}`);
    const ai = await callAI(aiInput, SYSTEM_PROMPT, openaiKey);

    // 5. Update DB
    const { error: updErr } = await supabase
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

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
