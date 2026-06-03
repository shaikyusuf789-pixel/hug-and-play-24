import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { script_id, chunk_id, chunk_number, slide_source } = await req.json();

    if (!script_id || !chunk_id) {
      throw new Error("Missing script_id or chunk_id");
    }

    console.log(`[Annotations] Processing script ${script_id}, chunk ${chunk_id}, source ${slide_source}`);

    // 1. Fetch data
    const [chunkRes, ocrRes, tsRes] = await Promise.all([
      supabase.from("script_chunks").select("content").eq("id", chunk_id).single(),
      supabase.from("ocr_results").select("words").eq("chunk_id", chunk_id).eq("slide_source", slide_source).single(),
      supabase.from("audio_timestamps").select("words").eq("chunk_id", chunk_id).single(),
    ]);

    if (chunkRes.error) throw new Error(`Chunk not found: ${chunkRes.error.message}`);
    if (ocrRes.error) throw new Error(`OCR results not found: ${ocrRes.error.message}`);
    if (tsRes.error) throw new Error(`Timestamps not found: ${tsRes.error.message}`);

    const script_text = chunkRes.data.content;
    const ocr_words = JSON.parse(ocrRes.data.words || "[]");
    const ts_words = JSON.parse(tsRes.data.words || "[]");

    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAiKey) throw new Error("Missing OPENAI_API_KEY");

    // --- STAGE 1: GPT-4o (Decision & BBoxes) ---
    const stage1_prompt = `
Improve the annotation pipeline by choosing only the best annotation targets.

INPUTS:
1. SCRIPT TEXT: "${script_text}"
2. OCR DATA (Words found on slide with coordinates): ${JSON.stringify(ocr_words)}

TASK:
- Select important, visually meaningful text from the OCR and script.
- Prefer strong exam-relevant keywords and important phrases.
- Keep output sparse and clean. Do not over-generate (aim for 5-8 high-quality annotations).
- Avoid duplicates, filler, and weak targets.
- Ensure each chosen annotation has a visible OCR bbox.
- Identify which spoken word/phrase from the script corresponds to this visual element for timing later. Store this in "match_text".

RULES:
- ONLY 'circle' and 'underline' types are allowed.
- Return a JSON object with a key "annotations" which is a list of:
  { 
    "type": "circle"|"underline", 
    "target_text": "text as it appears in OCR", 
    "match_text": "corresponding word/phrase from the script to match timing",
    "bbox": {"x":0, "y":0, "w":0, "h":0}
  }
`;

    console.log("[AI] Stage 1: Running GPT-4o (Target Selection)...");
    const res1 = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are an expert educational video director. You choose only the most impactful keywords to highlight. Return only JSON." },
          { role: "user", content: stage1_prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    const data1 = await res1.json();
    if (!res1.ok) throw new Error(`GPT-4o failed: ${JSON.stringify(data1)}`);
    
    const stage1_content = JSON.parse(data1.choices[0].message.content || "{}");
    const proposed_annotations = stage1_content.annotations || [];
    console.log(`[AI] Stage 1 finished. Proposed ${proposed_annotations.length} annotations.`);

    if (proposed_annotations.length === 0) {
      return new Response(JSON.stringify({ ok: true, annotation_count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- STAGE 2: GPT-4o-mini (Timing Sync) ---
    const stage2_prompt = `
Fix the timing of selected annotations.

INPUTS:
1. PROPOSED ANNOTATIONS: ${JSON.stringify(proposed_annotations)}
2. EXACT WORD TIMESTAMPS: ${JSON.stringify(ts_words.map((w: any) => ({ w: w.text, s: w.start })))}

TASK:
- Match each "match_text" to the exact spoken word or phrase in the timestamp list.
- "start_time" must be the exact moment the word begins, not an estimate.
- If the exact phrase is not found, match the first meaningful word and use that timestamp.
- Never return a start_time that is earlier than the spoken word.
- If you cannot confidently match timing, drop that annotation by setting start_time to null.
- Remove or reject annotations that are too early, duplicated, or poorly matched.

RULES:
- Return a JSON object with a key "annotations".
- Keep annotations clear, useful, and visually balanced.
- Do not place annotations on empty or black areas.
- Prefer fewer strong annotations over many weak ones.
- ONLY include annotations with a valid numeric start_time.
`;

    console.log("[AI] Stage 2: Running GPT-4o-mini (Timing Sync)...");
    const res2 = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a precise audio-visual sync specialist. Return only JSON." },
          { role: "user", content: stage2_prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    const data2 = await res2.json();
    if (!res2.ok) throw new Error(`GPT-4o-mini failed: ${JSON.stringify(data2)}`);

    const stage2_content = JSON.parse(data2.choices[0].message.content || "{}");
    let final_annotations = stage2_content.annotations || [];
    
    // Final filtering: Ensure numeric start_time and basic quality
    final_annotations = final_annotations.filter((ann: any) => 
      typeof ann.start_time === 'number' && ann.start_time >= 0
    );

    console.log(`[AI] Stage 2 finished. Final count after filtering: ${final_annotations.length}.`);

    // 2. Save to DB
    const { error: upsertError } = await supabase.from("clip_annotations").upsert({
      script_id,
      chunk_id,
      chunk_number,
      slide_source,
      annotations: JSON.stringify(final_annotations),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: "script_id,chunk_id,slide_source"
    });

    if (upsertError) throw new Error(`Failed to save annotations: ${upsertError.message}`);

    return new Response(JSON.stringify({ ok: true, annotation_count: final_annotations.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("[Annotations Error]", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
