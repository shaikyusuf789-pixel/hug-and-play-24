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
Improve the annotation pipeline by choosing the best annotation targets for an educational video.

INPUTS:
1. SCRIPT TEXT: "${script_text}"
2. OCR DATA (Words found on slide with coordinates): ${JSON.stringify(ocr_words)}

TASK:
- Pick 8–12 strong annotations per chunk.
- Include the main heading, key subtopics, and a few important supporting keywords/phrases.
- Do not collapse everything into only 3–4 annotations.
- Every chosen annotation must map to visible OCR text.
- Avoid duplicates, filler, empty/black areas, and weak concepts.
- Spread annotations across the slide content, not only on the title.
- Identify which spoken word/phrase from the script corresponds to this visual element for timing later. Store this in "match_text".

RULES:
- ONLY 'circle' and 'underline' types are allowed.
- Prefer 'circle' for short key terms and 'underline' for key phrases.
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
          { role: "system", content: "You are an expert educational video director. You choose only the most impactful keywords to highlight. Balance: not too sparse, not too crowded. Return only JSON." },
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
Fix the timing of selected annotations using the provided timestamps.

INPUTS:
1. PROPOSED ANNOTATIONS: ${JSON.stringify(proposed_annotations)}
2. EXACT WORD TIMESTAMPS: ${JSON.stringify(ts_words.map((w: any) => ({ w: w.text, s: w.start })))}

TASK:
- Match each "match_text" to the exact spoken word or phrase in the timestamp list.
- "start_time" must be the exact moment the word begins (from the timestamp list).
- Do not use the slide title time just because the text appears on screen early.
- If the exact phrase is not found, use the first meaningful spoken word of that phrase.
- If a timing match is uncertain, drop that item instead of guessing (set start_time to null).
- Remove or reject annotations that are too early, duplicated, or poorly matched.

BALANCE RULES:
- The final output should feel complete: enough annotations to guide the viewer.
- If the result has fewer than 6 annotations and the slide has more useful content, keep more strong items.
- If too many items share the same time, keep the strongest ones and remove the rest.

SELF-CHECK BEFORE RETURNING:
1. Is the annotation useful?
2. Is the bbox on actual visible text?
3. Is the timing exact, not early?
4. Is the output too sparse?
5. Does the clip feel well covered?

RULES:
- Return a JSON object with a key "annotations".
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
          { role: "system", content: "You are a precise audio-visual sync specialist. You ensure timings are exact and the final result is balanced. Return only JSON." },
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
