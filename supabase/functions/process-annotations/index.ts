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
You are an AI director for an educational video. Your goal is to choose which words or phrases on the slide should be annotated (circled or underlined) to emphasize what the narrator is saying.

INPUTS:
1. SCRIPT TEXT: "${script_text}"
2. OCR DATA (Words found on slide with coordinates): ${JSON.stringify(ocr_words.slice(0, 100))} ...
3. ROUGH TIMESTAMPS: ${JSON.stringify(ts_words.slice(0, 50).map((w: any) => ({ t: w.text, s: w.start })))} ...

TASK:
- Choose exactly 10 to 15 annotations in total for this chunk.
- Balance: Aim for 5 to 7 'circle' annotations; the remaining should be 'underline'.
- Identify key concepts, keywords, or short phrases being spoken that are visible on the slide.
- Choose annotation type: 'circle' (for single words or short terms) or 'underline' (for key phrases).
- USE OCR DATA: Provide the exact bounding box (x, y, w, h) for the target text.

RULES:
- ONLY 'circle' and 'underline' types are allowed.
- AVOID LONG UNDERLINES: Never underline a full line or a full slide. Keep underlines clean and focused on specific keywords/phrases (1-4 words).
- Make it feel like a human tutor: Annotate things as they are mentioned.
- Return a JSON object with a key "annotations" which is a list of:
  { "type": "circle"|"underline", "target_text": "text", "bbox": {"x":0, "y":0, "w":0, "h":0}, "start_time": 0.0 }
`;

    console.log("[AI] Stage 1: Running GPT-4o...");
    const res1 = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a precise AI director. Return only JSON." },
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

    // --- STAGE 2: GPT-4o-mini (Timestamp Sync) ---
    const stage2_prompt = `
You are a precise audio-visual sync specialist. You need to correct the start_times of proposed annotations to match the exact moment the narrator speaks those words.

INPUTS:
1. PROPOSED ANNOTATIONS: ${JSON.stringify(proposed_annotations)}
2. EXACT WORD TIMESTAMPS (from narrator): ${JSON.stringify(ts_words.map((w: any) => ({ w: w.text, s: w.start })))}

TASK:
- For each proposed annotation, find the "target_text" in the "EXACT WORD TIMESTAMPS" list.
- If the target_text is a phrase, use the "start" time of the FIRST word in that phrase.
- Update the "start_time" field with the exact "s" value from the timestamps.
- Return the exact same list of annotations but with corrected "start_time" values.

RULES:
- Return a JSON object with a key "annotations".
- DO NOT change the 'type', 'target_text', or 'bbox'. ONLY correct 'start_time'.
`;

    console.log("[AI] Stage 2: Running GPT-4o-mini for sync...");
    const res2 = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a sync specialist. Return only JSON." },
          { role: "user", content: stage2_prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    const data2 = await res2.json();
    if (!res2.ok) throw new Error(`GPT-4o-mini failed: ${JSON.stringify(data2)}`);

    const stage2_content = JSON.parse(data2.choices[0].message.content || "{}");
    const final_annotations = stage2_content.annotations || [];
    console.log(`[AI] Stage 2 finished. Synced ${final_annotations.length} annotations.`);

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
