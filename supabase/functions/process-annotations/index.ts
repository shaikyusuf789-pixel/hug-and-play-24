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
- Include the main heading, key subtopics, and important supporting keywords/phrases.
- EVERY chosen annotation must map to visible OCR text.
- Spread annotations across the slide content, not only on the title.
- Identify the exact spoken word/phrase from the script that corresponds to this visual element for timing later. Store this in "match_text".

CRITICAL QUALITY RULES:
1. NO OVER-COMBINING: Keep annotations separate and specific. Do not merge unrelated concepts (e.g., "Laws of Motion and Gravitation" should be separate from specific laws if they are spoken separately).
2. VISUAL CLARITY: Prefer fewer strong annotations over many weak ones if the slide is crowded, but ensure the result is not too sparse.
3. SPECIFICITY: Each annotation should highlight one distinct concept or phrase at a time.

RULES:
- ONLY 'circle' and 'underline' types are allowed.
- Return a JSON object with a key "annotations" which is a list of:
  { 
    "type": "circle"|"underline", 
    "target_text": "text as it appears in OCR", 
    "match_text": "exact word/phrase from the script to match timing",
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
          { role: "system", content: "You are an expert educational video director. You choose only the most impactful keywords to highlight. You never merge unrelated concepts. Return only JSON." },
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

    // --- STAGE 2: GPT-4o (Timing Sync) ---
    const stage2_prompt = `
Fix the timing of selected annotations using the provided timestamps.

INPUTS:
1. SCRIPT TEXT: "${script_text}"
2. PROPOSED ANNOTATIONS: ${JSON.stringify(proposed_annotations)}
3. EXACT WORD TIMESTAMPS: ${JSON.stringify(ts_words.map((w: any) => ({ w: w.text, s: w.start })))}

TASK:
- Match each "match_text" to the exact spoken word or phrase in the timestamp list.
- "start_time" must be the exact moment the word begins (from the timestamp list).

TIMING RULES (CRITICAL):
1. NO EARLY TIMING: Do not use the slide title time as the default. The annotation must appear exactly when the word is SPOKEN in the narrative flow.
2. NARRATIVE FLOW: Use the SCRIPT TEXT to understand which occurrence of a word (like "SSC" or "Science") is being referred to. If it's spoken at 0.1s in the intro but again at 6.4s in the explanation, pick 6.4s if it belongs to the explanation part.
3. EXACT MATCH: If the phrase is not found exactly, use the first meaningful spoken word of that phrase.
4. DROP UNCERTAIN: If timing is uncertain or if the word isn't spoken in this chunk, set "start_time" to null (it will be filtered out).
5. NO GUESSING: If the timing would be "too early" (near 0s) for a concept that appears later in the script, it is likely a mismatch.

BALANCE RULES:
- If too many items share the same time, keep the strongest one and remove the rest.
- Ensure the result is well-distributed over the clip duration.

SELF-CHECK:
- Is this annotation useful?
- Is the bbox on actual visible text?
- Is the timing EXACT, not early?
- Does the clip feel well covered?

RULES:
- Return a JSON object with a key "annotations".
- ONLY include annotations with a valid numeric start_time.
`;

    console.log("[AI] Stage 2: Running GPT-4o (Timing Sync)...");
    const res2 = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a precise audio-visual sync specialist. You ensure timings are exact based on the spoken script. You avoid early timing at all costs. Return only JSON." },
          { role: "user", content: stage2_prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    const data2 = await res2.json();
    if (!res2.ok) throw new Error(`GPT-4o failed: ${JSON.stringify(data2)}`);

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
