// supabase/functions/apply-fact-corrections/index.ts
// Merges approved fact corrections into the original script while preserving
// tone, style, code-mix, sentence rhythm. Only the wrong facts are swapped.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

You MUST respond by calling the return_corrected_script tool with the full corrected script.`;

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

    const LOVABLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_API_KEY is not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const chosenModel = model || "gemini-2.5-pro";

    const fixesBlock = findings
      .map(
        (f, i) =>
          `FIX ${i + 1}:\n- claim: ${f.claim}\n- correction: ${f.correction}${
            f.source ? `\n- source: ${f.source}` : ""
          }`,
      )
      .join("\n\n");

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: chosenModel,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content:
                `ORIGINAL_SCRIPT:\n---\n${script}\n---\n\nAPPROVED_FACT_FIXES:\n${fixesBlock}\n\nReturn the full corrected script via the tool.`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "return_corrected_script",
                description:
                  "Return the full script with only the approved factual fixes applied.",
                parameters: {
                  type: "object",
                  properties: {
                    corrected_script: { type: "string" },
                  },
                  required: ["corrected_script"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "return_corrected_script" },
          },
        }),
      },
    );

    if (!response.ok) {
      const t = await response.text();
      console.error("Google AI error:", response.status, t);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited. Please retry shortly." }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({
            error:
              "Workspace credits exhausted. Add funds in Settings → Workspace → Usage.",
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      return new Response(
        JSON.stringify({ error: "Google AI error", details: t }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const data = await response.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    let corrected = "";
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        corrected = String(parsed.corrected_script || "");
      } catch (e) {
        console.error("Failed to parse tool args:", e);
      }
    }

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
