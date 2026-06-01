// supabase/functions/fact-check-script/index.ts
// Reads a generated script and returns ONLY the factually-incorrect claims with corrections.
// Does NOT modify the original script.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { geminiGenerateJson, normalizeGeminiModel, requireGoogleApiKey } from "../_shared/google-ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a meticulous fact-checking research assistant for SSC / government-exam voiceover scripts (Telugu + English mix).

Your job:
1. Read the script the user gives you.
2. Identify ONLY factual claims that are verifiable: exam dates, notification release dates, salary figures, vacancy counts, eligibility rules, historical dates (e.g. Republic Day, Independence Day), names of officials, scheme launch years, statistics, capital cities, geographical facts, etc.
3. Cross-check each claim against your best knowledge of authoritative sources (SSC.gov.in, official government portals, Wikipedia, recognised news outlets, etc.).
4. Return ONLY the claims that are WRONG, OUTDATED, MISLEADING, or UNVERIFIABLE-AND-SUSPICIOUS.
5. Do NOT return claims that are correct. Do NOT return opinions, motivational lines, or stylistic phrasing.
6. NEVER rewrite or alter the original script — you only report findings.

For every finding, return:
- "claim": the exact wording from the script (quote it verbatim)
- "issue": what's wrong with it (1-2 sentences, plain English)
- "correction": the correct fact, written in a short factual phrase that can later be merged back into the script in the same tone
- "source": a short label of the authoritative source (e.g. "SSC.gov.in", "Wikipedia: Republic Day", "PIB India")
- "severity": "high" | "medium" | "low"

If you find ZERO factual issues, return an empty findings array.

Return ONLY valid JSON in this shape: {"findings":[...]}. Do not respond with prose.`;

interface Body {
  script?: string;
  model?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { script, model }: Body = await req.json();

    if (!script || !script.trim()) {
      return new Response(JSON.stringify({ error: "script is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    const parsed = await geminiGenerateJson<{ findings?: any[] }>(apiKey, {
      model: chosenModel,
      system: SYSTEM_PROMPT,
      user: `Fact-check the following script. Return ONLY JSON: {"findings":[...]}.\n\n--- SCRIPT START ---\n${script}\n--- SCRIPT END ---`,
      temperature: 0.1,
    });
    const findings = Array.isArray(parsed.findings) ? parsed.findings : [];

    return new Response(
      JSON.stringify({ findings, model: chosenModel }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("fact-check-script error:", e);
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
