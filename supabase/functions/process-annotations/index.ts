import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================
// Deterministic phrase → timestamp aligner
// ============================================================
// Replaces the GPT Stage-2 "timing sync" call. The previous Stage-2
// frequently anchored annotations to the wrong (earliest) occurrence
// of a sub-word, firing them 3–17 seconds too early.
//
// Strategy:
//   1. Tokenize match_text into content words (drop stop-words/punct).
//   2. Slide a window across ts_words. For each window position,
//      score how many of the match tokens appear (in order, fuzzy).
//   3. Return the start time of the best-scoring window.
//   4. If no window scores well (>= 50% token coverage), drop the
//      annotation rather than guessing.
// ============================================================

const STOP = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "of", "for", "to", "in", "on", "at", "by", "with", "from", "as",
  "and", "or", "but", "so", "if", "then", "than", "that", "this",
  "these", "those", "it", "its", "i", "you", "we", "they", "he", "she",
  "will", "would", "can", "could", "should", "may", "might", "do", "does",
  "did", "has", "have", "had",
]);

function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): string[] {
  return normalize(s).split(" ").filter((w) => w && !STOP.has(w));
}

function tokenMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  // prefix match in either direction handles plurals/inflections
  if (a.length >= 4 && b.startsWith(a)) return true;
  if (b.length >= 4 && a.startsWith(b)) return true;
  return false;
}

/**
 * Find the timestamp where `matchText` is spoken in `tsWords`.
 *
 * Returns null if no confident match found.
 *
 * @param matchText  Phrase from the script we want to align to audio.
 * @param tsWords    Array of {text|word, start} word-level timestamps.
 * @param minAfter   Earliest acceptable start time (used to anchor
 *                   subsequent annotations after previously placed ones).
 */
function alignPhrase(
  matchText: string,
  tsWords: Array<{ text?: string; word?: string; start: number }>,
  minAfter = 0,
): { start: number; score: number } | null {
  const tokens = tokenize(matchText);
  if (tokens.length === 0 || tsWords.length === 0) return null;

  const wordTokens = tsWords.map((w) => normalize(w.text || w.word || ""));
  const windowSize = Math.max(tokens.length + 2, 6);

  let best: { start: number; score: number } | null = null;

  for (let i = 0; i < wordTokens.length; i++) {
    const startTime = Number(tsWords[i].start) || 0;
    if (startTime < minAfter) continue;

    // Count how many match tokens appear (in order) within the window
    const windowEnd = Math.min(wordTokens.length, i + windowSize);
    let cursor = i;
    let hits = 0;
    let firstHitTime: number | null = null;

    for (const tok of tokens) {
      let found = -1;
      for (let j = cursor; j < windowEnd; j++) {
        if (tokenMatch(tok, wordTokens[j])) {
          found = j;
          break;
        }
      }
      if (found >= 0) {
        hits++;
        if (firstHitTime === null) {
          firstHitTime = Number(tsWords[found].start) || startTime;
        }
        cursor = found + 1;
      }
    }

    const score = hits / tokens.length;
    if (score > (best?.score ?? 0) && firstHitTime !== null) {
      best = { start: firstHitTime, score };
      if (score === 1) break; // perfect match, stop early
    }
  }

  // Require at least 50% token coverage to accept
  if (!best || best.score < 0.5) return null;
  return best;
}

// ============================================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { script_id, chunk_id, chunk_number, slide_source } = await req.json();
    if (!script_id || !chunk_id) throw new Error("Missing script_id or chunk_id");

    console.log(`[Annotations] script=${script_id} chunk=${chunk_id} source=${slide_source}`);

    // 1. Fetch chunk + OCR + timestamps
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
    const ts_words = JSON.parse(tsRes.data.words || "[]");

    const audioDuration = ts_words.length
      ? Number(ts_words[ts_words.length - 1].end || ts_words[ts_words.length - 1].start || 0)
      : 0;

    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAiKey) throw new Error("Missing OPENAI_API_KEY");

    // --- STAGE 1: GPT-4o (selection + LONG match_text for alignment) ---
    const stage1_prompt = `
You are an educational video director selecting annotations for a slide.

INPUTS:
1. SPOKEN SCRIPT (what the narrator says, in order):
"""
${script_text}
"""

2. OCR WORDS visible on the slide (with bounding boxes):
${JSON.stringify(ocr_words)}

TASK:
Pick 8–12 high-impact annotations for this clip.

For EACH annotation return:
- "type":         "circle" or "underline" only (no other types).
- "target_text":  the exact text from OCR to highlight (1–6 words max).
- "bbox":         {x, y, w, h} copied from OCR.
- "match_text":   the FULL surrounding phrase from the SCRIPT (NOT from OCR)
                  where the narrator EXPLAINS this concept. Must be
                  6–15 consecutive words copied verbatim from the script,
                  containing the target keyword. This is used to align
                  the annotation to the audio timeline.

CRITICAL RULES:
A. match_text MUST be a substring of the SCRIPT, not the OCR. Copy
   6–15 words around the moment the narrator actually talks about this
   concept (not where it first appears in an agenda list).
B. If the same keyword appears multiple times in the script (e.g. once
   in an intro agenda and again in the deep-dive section), pick the
   DEEP-DIVE occurrence — the moment the narrator EXPLAINS it.
C. Never pick the main slide title/heading as an annotation unless it
   is genuinely the topic-of-the-day being introduced.
D. Keep target_text short (≤6 words). Never highlight a full sentence.
E. Spread annotations across the slide content; avoid clustering.

Return JSON: { "annotations": [ { type, target_text, match_text, bbox }, ... ] }
`;

    console.log("[AI] Stage 1: selecting targets...");
    const res1 = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "You select educational video annotations. You always quote match_text verbatim from the SPOKEN SCRIPT (not OCR), choosing the deep-dive occurrence over the agenda/intro occurrence. Return only JSON.",
          },
          { role: "user", content: stage1_prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    const data1 = await res1.json();
    if (!res1.ok) throw new Error(`GPT-4o failed: ${JSON.stringify(data1)}`);
    const stage1_content = JSON.parse(data1.choices[0].message.content || "{}");
    const proposed = stage1_content.annotations || [];
    console.log(`[AI] Stage 1 proposed ${proposed.length} annotations.`);

    if (proposed.length === 0) {
      return new Response(JSON.stringify({ ok: true, annotation_count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- STAGE 2: deterministic alignment (no GPT) ---
    console.log("[Align] Deterministic phrase alignment starting...");
    const aligned: any[] = [];
    let lastStart = 0;

    // Detect intro/agenda region: first 25% of script (where lists like
    // "1. Eligibility 2. Age Limit 3. Qualification" usually live).
    // We'll avoid placing annotations in the first 25% of audio unless
    // their match_text actually lives in the first 25% of the script.
    const introCutoffAudio = audioDuration * 0.25;
    const scriptLen = script_text.length;
    const introCutoffScript = Math.floor(scriptLen * 0.25);
    const scriptLower = script_text.toLowerCase();

    for (const ann of proposed) {
      const matchText: string = ann.match_text || ann.target_text || "";
      if (!matchText) continue;

      // Try alignment, preferring matches AFTER the last placed annotation
      // (annotations are usually returned in slide-reading order).
      let result = alignPhrase(matchText, ts_words, lastStart);

      // If nothing after lastStart, retry from the beginning.
      if (!result) result = alignPhrase(matchText, ts_words, 0);
      if (!result) {
        console.log(`[Align] DROP "${ann.target_text}" — no confident match.`);
        continue;
      }

      // Guard C: drop early annotations whose phrase isn't in the intro of the script.
      if (result.start < introCutoffAudio) {
        const matchLower = normalize(matchText);
        const idxInScript = scriptLower.indexOf(matchLower.split(" ")[0] || "");
        const isPhraseInIntro = idxInScript >= 0 && idxInScript < introCutoffScript;
        if (!isPhraseInIntro) {
          // Re-align forcing search past the intro audio region
          const retry = alignPhrase(matchText, ts_words, introCutoffAudio);
          if (retry && retry.score >= 0.5) {
            result = retry;
          } else {
            console.log(
              `[Align] DROP "${ann.target_text}" — early-firing guard (matched ${result.start.toFixed(2)}s, no intro context).`,
            );
            continue;
          }
        }
      }

      lastStart = result.start;

      aligned.push({
        type: ann.type,
        target_text: ann.target_text,
        bbox: ann.bbox,
        start_time: Number(result.start.toFixed(2)),
        _score: Number(result.score.toFixed(2)),
      });

      console.log(
        `[Align] "${ann.target_text}" → ${result.start.toFixed(2)}s (score=${result.score.toFixed(2)})`,
      );
    }

    // Strip internal score before saving
    const final_annotations = aligned.map(({ _score, ...rest }) => rest);

    console.log(`[Align] Final count: ${final_annotations.length} of ${proposed.length} proposed.`);

    // 2. Save
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
