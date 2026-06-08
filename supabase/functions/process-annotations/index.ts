import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getSupabaseServiceKey() {
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS")?.match(/sb_secret_[A-Za-z0-9_-]+/)?.[0];
  if (secretKeys) return secretKeys;

  for (const name of ["CUSTOM_SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    const raw = Deno.env.get(name)?.trim();
    if (raw?.startsWith("sb_secret_") || raw?.startsWith("eyJ")) return raw;
  }
  return "";
}

// ============================================================
// 2-GPT Annotation Pipeline
//
// Stage 1 — GPT-4o
//   Input : OCR words (text + bbox) + spoken script
//   Output: annotations with type, target_text, bbox, match_text
//           (match_text = verbatim phrase from script for alignment)
//
// Stage 2 — GPT-4o-mini
//   Input : all match_text phrases + full word timestamps list
//   Output: start_time for each annotation
//           (GPT reads timestamps and finds when each phrase is spoken)
// ============================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      getSupabaseServiceKey(),
    );

    const { script_id, chunk_id, chunk_number, slide_source } = await req.json();
    if (!script_id || !chunk_id) throw new Error("Missing script_id or chunk_id");

    console.log(`[Annotations] script=${script_id} chunk=${chunk_id} source=${slide_source}`);

    // ── Fetch chunk + OCR + timestamps in parallel ──────────────────────
    const [chunkRes, ocrRes, tsRes] = await Promise.all([
      supabase.from("script_chunks").select("content").eq("id", chunk_id).single(),
      supabase.from("ocr_results").select("words").eq("chunk_id", chunk_id).eq("slide_source", slide_source).single(),
      supabase.from("audio_timestamps").select("words").eq("chunk_id", chunk_id).single(),
    ]);

    if (chunkRes.error) throw new Error(`Chunk not found: ${chunkRes.error.message}`);
    if (ocrRes.error) throw new Error(`OCR not found: ${ocrRes.error.message}`);
    if (tsRes.error) throw new Error(`Timestamps not found: ${tsRes.error.message}`);

    const script_text: string = chunkRes.data.content || "";
    const ocr_words = JSON.parse(ocrRes.data.words || "[]");
    const ts_words: Array<{ text?: string; word?: string; start: number; end?: number }> =
      JSON.parse(tsRes.data.words || "[]");

    const audioDuration = ts_words.length
      ? Number(ts_words[ts_words.length - 1].end ?? ts_words[ts_words.length - 1].start ?? 0)
      : 0;

    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAiKey) throw new Error("Missing OPENAI_API_KEY");

    // ── STAGE 1: GPT-4o — select annotations ────────────────────────────
    const stage1_system = `You select educational video annotations. 
Always quote match_text verbatim from the SPOKEN SCRIPT (not OCR), 
choosing the deep-dive occurrence over the agenda/intro occurrence.
Return only valid JSON.`;

    const stage1_user = `You are an educational video director selecting annotations for a slide.

INPUTS:
1. SPOKEN SCRIPT (what the narrator says, in order):
"""
${script_text}
"""

2. OCR WORDS visible on the slide (with bounding boxes):
${JSON.stringify(ocr_words)}

TASK:
Pick 6–10 high-impact annotations for this clip.

For EACH annotation return:
- "type":        "circle" or "underline" or "pen" only (no other types).
                 Distribution: ~50% underline, ~30% circle, ~20% pen.
- "target_text": the exact text from OCR to highlight (1–6 words max).
- "bbox":        {x, y, w, h} copied exactly from OCR data above.
- "match_text":  6–15 consecutive words copied VERBATIM from the SCRIPT
                 where the narrator explains this concept. Used for
                 precise audio alignment. Must contain the keyword.

CRITICAL RULES:
A. match_text MUST be a verbatim substring of the SCRIPT above.
B. Pick the DEEP-DIVE occurrence of each term (not agenda/list intro).
C. Never highlight the main slide title unless it is the topic-of-the-day.
D. Spread annotations across all slide content; avoid clustering.

Return JSON: { "annotations": [ { type, target_text, match_text, bbox }, ... ] }`;

    console.log("[Stage1] GPT-4o selecting annotations...");
    const res1 = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openAiKey}` },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: stage1_system },
          { role: "user", content: stage1_user },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });

    const data1 = await res1.json();
    if (!res1.ok) throw new Error(`GPT-4o Stage1 failed: ${JSON.stringify(data1)}`);

    const stage1_content = JSON.parse(data1.choices[0].message.content || "{}");
    const proposed: any[] = stage1_content.annotations || [];
    console.log(`[Stage1] proposed ${proposed.length} annotations`);

    if (proposed.length === 0) {
      return new Response(JSON.stringify({ ok: true, annotation_count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── STAGE 2: GPT-4o-mini — precise timestamp alignment ──────────────
    // Format timestamps as a readable table for GPT
    const tsTable = ts_words
      .map((w, i) => `${i.toString().padStart(3)}: ${String(w.start).padStart(6)}s  "${w.text ?? w.word ?? ""}"`)
      .join("\n");

    const annList = proposed
      .map((a, i) => `${i}: match_text="${a.match_text || a.target_text}"`)
      .join("\n");

    const stage2_system = `You are a precise audio-to-text aligner.
Given a list of word timestamps and a list of phrases, 
find the exact start time (in seconds) when each phrase begins in the audio.
Return ONLY valid JSON.`;

    const stage2_user = `WORD TIMESTAMPS (index: time  "word"):
${tsTable}

PHRASES TO ALIGN (find start_time for each):
${annList}

For each phrase, find the word in the timestamps where the narrator STARTS 
saying that phrase. Return the "start" time of that word.

Rules:
- Match semantically, not just literally (narrator uses English, phrases may be English).
- Pick the CONTENT occurrence, not the intro/agenda mention if there are multiple.
- If a phrase cannot be found, use -1.

Return JSON: { "timings": [ { "index": 0, "start_time": 1.80 }, ... ] }`;

    console.log("[Stage2] GPT-4o-mini aligning timestamps...");
    const res2 = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openAiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: stage2_system },
          { role: "user", content: stage2_user },
        ],
        response_format: { type: "json_object" },
        temperature: 0.0,
      }),
    });

    const data2 = await res2.json();
    if (!res2.ok) throw new Error(`GPT-4o-mini Stage2 failed: ${JSON.stringify(data2)}`);

    const stage2_content = JSON.parse(data2.choices[0].message.content || "{}");
    const timings: Array<{ index: number; start_time: number }> = stage2_content.timings || [];
    console.log(`[Stage2] got ${timings.length} timings`);

    // ── Merge Stage 1 + Stage 2 ──────────────────────────────────────────
    const timingMap = new Map(timings.map((t) => [t.index, t.start_time]));

    const final_annotations: any[] = [];
    for (let i = 0; i < proposed.length; i++) {
      const ann = proposed[i];
      const start_time = timingMap.get(i);

      // Drop if GPT returned -1 (not found) or undefined
      if (start_time === undefined || start_time < 0) {
        console.log(`[Merge] DROP ann[${i}] "${ann.target_text}" — no timing found`);
        continue;
      }

      // Drop if bbox is missing or invalid
      const bbox = ann.bbox;
      if (!bbox || (Array.isArray(bbox) && bbox.length < 4) ||
          (typeof bbox === "object" && !Array.isArray(bbox) && (bbox.x === undefined))) {
        console.log(`[Merge] DROP ann[${i}] "${ann.target_text}" — invalid bbox`);
        continue;
      }

      final_annotations.push({
        type: ann.type || "underline",
        target_text: ann.target_text,
        bbox: bbox,
        start_time: Number(start_time.toFixed(2)),
      });

      console.log(`[Merge] ann[${i}] "${ann.target_text}" → ${start_time.toFixed(2)}s`);
    }

    console.log(`[Merge] Final: ${final_annotations.length} of ${proposed.length} annotations`);

    // ── Save to DB ───────────────────────────────────────────────────────
    const { error: upsertError } = await supabase.from("clip_annotations").upsert(
      {
        script_id,
        chunk_id,
        chunk_number,
        slide_source,
        annotations: JSON.stringify(final_annotations),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "script_id,chunk_id,slide_source" },
    );

    if (upsertError) throw new Error(`Save failed: ${upsertError.message}`);

    return new Response(
      JSON.stringify({ ok: true, annotation_count: final_annotations.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[Annotations Error]", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
