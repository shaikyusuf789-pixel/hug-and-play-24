// supabase/functions/apply-fact-corrections/index.ts
// Merges approved fact corrections into the original script while preserving
// tone, style, code-mix, sentence rhythm. Only the wrong facts are swapped.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { geminiGenerateJson, normalizeGeminiModel, requireGoogleApiKey } from "../_shared/google-ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a surgical script editor for SSC / government-exam Telugu+English voiceover scripts.

You will receive:
- ORIGINAL_SCRIPT: a finished script the writer is happy with.
- APPROVED_FACT_FIXES: a list of factual corrections. Each item has "claim" (the wrong wording currently in the script), "correction" (the correct fact), and optional "source".

Your job:
1. Locate each "claim" in the ORIGINAL_SCRIPT.
2. Replace ONLY the factually-wrong portion of that claim with the "correction", rewritten so it slots in naturally with the surrounding sentence — keeping the EXACT same tone, language mix (Telugu + English), pacing, punctuation style, and voice.
3. Do NOT rewrite, summarize, shorten, lengthen, reorder, or "improve" any other part of the script.
4. Do NOT add commentary, source citations, brackets, footnotes, or "[corrected]" markers in the output.
5. Do NOT change paragraph structure, line breaks, emojis, or formatting beyond the exact words being corrected.
6. If a claim cannot be found verbatim in the script, find the closest matching sentence and apply the correction there with the same minimal-edit rule.
7. The total word count of the output should remain within ±5% of the original.

Return ONLY valid JSON in this shape: {"corrected_script":"<full corrected script>"}.`;

interface Finding {
  claim: string;
  correction: string;
  source?: string;
  issue?: string;
}

interface Body {
  script?: string;
  findings?: Finding[];
  model?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { script, findings, model }: Body = await req.json();

    if (!script || !script.trim()) {
      return new Response(JSON.stringify({ error: "script is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!Array.isArray(findings) || findings.length === 0) {
      return new Response(
        JSON.stringify({ error: "findings array is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let apiKey = "";
    try {
      apiKey = requireGoogleApiKey();
    } catch (_) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_API_KEY is not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const chosenModel = normalizeGeminiModel(model, "gemini-2.5-pro");

    const fixesBlock = findings
      .map(
        (f, i) =>
          `FIX ${i + 1}:\n- claim: ${f.claim}\n- correction: ${f.correction}${
            f.source ? `\n- source: ${f.source}` : ""
          }`,
      )
      .join("\n\n");

    const parsed = await geminiGenerateJson<{ corrected_script?: string }>(apiKey, {
      model: chosenModel,
      system: SYSTEM_PROMPT,
      user: `ORIGINAL_SCRIPT:\n---\n${script}\n---\n\nAPPROVED_FACT_FIXES:\n${fixesBlock}\n\nReturn ONLY JSON with corrected_script.`,
      temperature: 0.1,
    });
    const corrected = String(parsed.corrected_script || "");

    if (!corrected.trim()) {
      return new Response(
        JSON.stringify({ error: "AI did not return a corrected script" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({ corrected_script: corrected, model: chosenModel }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("apply-fact-corrections error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
