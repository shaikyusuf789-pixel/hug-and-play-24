// supabase/functions/generate-script/index.ts
// Generates a SKY Academy Telugu voiceover script.
// MUST read all 4 transcripts (HOW to speak) + SKY DNA (WHAT to speak).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { systemPromptFor, OUTPUT_FORMAT } from "./prompts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  mode?: "topic" | "transcript" | "pdf";
  input: string;          // topic / transcript text / pdf text
  title?: string;
  video_type?: "GENERAL" | "SUBJECTIVE";
  num_segs?: number;
  idea_id?: string | null;
  model?: string;
  save?: boolean;
}

function extractJsonArray(text: string): any[] {
  // Strip code fences if present
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const start = t.indexOf("[");
  const end = t.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("No JSON array in model output");
  return JSON.parse(t.slice(start, end + 1));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as Body;
    const mode = body.mode ?? "topic";
    const videoType = body.video_type ?? "SUBJECTIVE";
    const numSegs = Math.max(1, Math.min(20, body.num_segs ?? 5));
    const model = body.model ?? "google/gemini-2.5-pro";
    const save = body.save !== false;

    if (!body.input || typeof body.input !== "string") {
      return new Response(JSON.stringify({ error: "input is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch any boss-edited overrides from app_settings (training:* keys).
    const supabaseForSettings = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const overrideKeys = [
      "training:transcript_1",
      "training:transcript_2",
      "training:transcript_3",
      "training:transcript_4",
      "training:sky_dna_general",
      "training:sky_dna_subjective",
    ];
    const { data: settingsRows } = await supabaseForSettings
      .from("app_settings")
      .select("key, value")
      .in("key", overrideKeys);
    const settingsMap = new Map((settingsRows ?? []).map((r: any) => [r.key, r.value]));
    const readVal = (k: string): string | null => {
      const v = settingsMap.get(k);
      if (!v) return null;
      if (typeof v === "string") return v;
      if (typeof v === "object" && typeof v.text === "string") return v.text;
      return null;
    };
    const overrides = {
      transcripts: [
        readVal("training:transcript_1"),
        readVal("training:transcript_2"),
        readVal("training:transcript_3"),
        readVal("training:transcript_4"),
      ],
      dna_general: readVal("training:sky_dna_general"),
      dna_subjective: readVal("training:sky_dna_subjective"),
    };

    const systemPrompt = systemPromptFor(mode, videoType, overrides).replace(
      "{NUM_SEGS}",
      String(numSegs),
    );

    const userPrompt =
      mode === "topic"
        ? `TOPIC: ${body.input}\n\nGenerate exactly ${numSegs} segments. Remember: read every word of all 4 reference transcripts BEFORE writing.`
        : mode === "transcript"
          ? `SOURCE VIDEO TRANSCRIPT:\n${body.input}\n\nRewrite into exactly ${numSegs} SKY Academy segments. Read every word of all 4 reference transcripts BEFORE writing.`
          : `SOURCE PDF / BOOK TEXT:\n${body.input}\n\nAdapt into exactly ${numSegs} SKY Academy teaching segments. Read every word of all 4 reference transcripts BEFORE writing.`;

    console.log("generate-script call", {
      mode, videoType, numSegs, model,
      inputChars: body.input.length,
      systemChars: systemPrompt.length,
    });

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errTxt = await aiRes.text();
      console.error("AI gateway error", aiRes.status, errTxt);
      return new Response(
        JSON.stringify({ error: "AI gateway error", status: aiRes.status, detail: errTxt }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiJson = await aiRes.json();
    const content: string = aiJson?.choices?.[0]?.message?.content ?? "";
    let segments: any[];
    try {
      segments = extractJsonArray(content);
    } catch (e) {
      console.error("Parse failure", e, content.slice(0, 500));
      return new Response(
        JSON.stringify({ error: "Model did not return valid JSON", raw: content }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const combinedText = segments
      .map((s) => s.telugu_text ?? "")
      .join("\n\n");
    const wordCount = combinedText.split(/\s+/).filter(Boolean).length;
    const title = body.title ?? (segments[0]?.title ?? "SKY Academy Script");

    let scriptId: string | null = null;
    let chunkIds: string[] = [];

    if (save) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: scriptRow, error: scriptErr } = await supabase
        .from("scripts")
        .insert({
          idea_id: body.idea_id ?? null,
          title,
          content: combinedText,
          word_count: wordCount,
          video_type: videoType,
          model,
          status: "SCRIPT_DONE",
        })
        .select()
        .single();

      if (scriptErr) {
        console.error("script insert error", scriptErr);
      } else {
        scriptId = scriptRow.id;
        const chunkRows = segments.map((s, i) => ({
          script_id: scriptId,
          chunk_index: s.seg ?? i + 1,
          content: s.telugu_text ?? "",
          word_count: (s.telugu_text ?? "").split(/\s+/).filter(Boolean).length,
          status: "PENDING",
          annotations: { title: s.title ?? null },
        }));
        const { data: chunkData, error: chunkErr } = await supabase
          .from("script_chunks")
          .insert(chunkRows)
          .select("id");
        if (chunkErr) console.error("chunk insert error", chunkErr);
        else chunkIds = (chunkData ?? []).map((c: any) => c.id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        script_id: scriptId,
        chunk_ids: chunkIds,
        title,
        word_count: wordCount,
        segments,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("generate-script fatal", e);
    return new Response(
      JSON.stringify({ error: String((e as Error)?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
