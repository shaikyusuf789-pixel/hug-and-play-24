// supabase/functions/fact-check-script/index.ts
// Reads a generated script and returns ONLY the factually-incorrect claims with corrections.
// Does NOT modify the original script.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

You MUST respond by calling the report_findings tool. Do not respond with prose.`;

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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const chosenModel = model || "google/gemini-2.5-pro";

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
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
                `Fact-check the following script. Return ONLY the incorrect/suspicious factual claims.\n\n--- SCRIPT START ---\n${script}\n--- SCRIPT END ---`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "report_findings",
                description:
                  "Return the list of factually incorrect or suspicious claims found in the script.",
                parameters: {
                  type: "object",
                  properties: {
                    findings: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          claim: { type: "string" },
                          issue: { type: "string" },
                          correction: { type: "string" },
                          source: { type: "string" },
                          severity: {
                            type: "string",
                            enum: ["high", "medium", "low"],
                          },
                        },
                        required: [
                          "claim",
                          "issue",
                          "correction",
                          "source",
                          "severity",
                        ],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["findings"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "report_findings" },
          },
        }),
      },
    );

    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
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
        JSON.stringify({ error: "AI gateway error", details: t }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const data = await response.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    let findings: any[] = [];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        findings = Array.isArray(parsed.findings) ? parsed.findings : [];
      } catch (e) {
        console.error("Failed to parse tool args:", e);
      }
    }

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
