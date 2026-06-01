// supabase/functions/generate-script-stream/index.ts
// Streams script generation token-by-token via Server-Sent Events so the
// client can render live (Gemini-chat-style). After the stream completes,
// the final script is saved to the `scripts` table and fact-checking is
// fired in the background (EdgeRuntime.waitUntil).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import {
  DNA_GENERAL,
  DNA_SUBJECTIVE,
  TELUGU_TTS_MASTER_PROMPT,
  type TrainingOverrides,
} from "./prompts.ts";
import { SKY_STYLE_TRANSCRIPTS } from "./transcripts.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FACT_CHECK_SYSTEM = `You are a meticulous fact-checking research assistant for SSC / government-exam voiceover scripts (Telugu + English mix).

CURRENT DATE CONTEXT: Today is ${new Date().toISOString().slice(0, 10)} (year ${new Date().getUTCFullYear()}). Events from earlier in this year OR previous years are PAST events, NOT "future" or "speculative". Do NOT flag a claim as wrong just because it post-dates your training cutoff -- your training data is stale, the script is current.

GROUND-TRUTH RULES:
1. The user supplies real source transcripts / research material. Treat recent events referenced in the script as REAL unless you have HIGH-CONFIDENCE contradicting evidence from well-established historical facts.
2. NEVER flag a claim with reasoning like "this hasn't happened yet", "this is in the future", or "speculative because year is 2026".
3. ONLY flag claims that are mathematically/historically impossible, internally contradictory, or contradicted by HARD established facts.
4. When in doubt about a recent event/stat, SKIP it.

OUTPUT: Return ONLY {"findings":[{"claim":"...","issue":"...","correction":"...","source":"...","severity":"high|medium|low"}]}. No markdown, no commentary.`;

interface Body {
  topic?: string;
  content?: string;
  chapterContext?: string;
  videoType?: "subjective" | "general" | "SUBJECTIVE" | "GENERAL";
  inputMode?: "topic" | "transcript" | "pdf" | "idea";
  wordCount?: number;
  specialInstructions?: string;
  model?: string;
  idea_id?: string | null;
  title?: string;
  factCheckModel?: string;
}

function buildStyleRefs(overrides?: TrainingOverrides) {
  return SKY_STYLE_TRANSCRIPTS
    .map((t, i) =>
      `--- REFERENCE TRANSCRIPT ${i + 1}: ${t.name} ---\n${
        overrides?.transcripts?.[i] || t.text
      }\n--- END REFERENCE ${i + 1} ---`
    )
    .join("\n\n");
}

function buildSystemPrompt(
  videoType: "GENERAL" | "SUBJECTIVE",
  inputMode: "topic" | "transcript" | "pdf" | "idea",
  targetWords: number,
  overrides?: TrainingOverrides,
) {
  const dna = videoType === "SUBJECTIVE"
    ? (overrides?.dna_subjective || DNA_SUBJECTIVE)
    : (overrides?.dna_general || DNA_GENERAL);
  const taskLine = inputMode === "transcript"
    ? "REWRITE the provided competitor transcript into ONE continuous SKY Academy Telugu voiceover script."
    : inputMode === "pdf"
    ? "ADAPT the provided book / PDF text into ONE continuous SKY Academy Telugu teaching voiceover."
    : "WRITE ONE complete, original SKY Academy Telugu voiceover script on the given topic / idea.";
  const min = Math.max(50, targetWords - 50);
  const max = targetWords + 50;
  // NOTE: streaming mode -> ask for PLAIN Telugu text (no JSON envelope) so
  // partial tokens are immediately renderable.
  const today = new Date().toISOString().slice(0, 10);
  return `
You are an expert Telugu video script writer for SKY Academy.
${taskLine}

================================================================
THREE-LAYER RULE (DO NOT VIOLATE -- READ TWICE)
================================================================
1. WHAT to speak  -> comes ONLY from the USER INPUT below
     (TOPIC / TITLE, CHAPTER / IDEA CONTEXT, SOURCE MATERIAL,
      SPECIAL INSTRUCTIONS). This is the idea-engine output.
2. HOW to speak   -> comes ONLY from the 4 STYLE REFERENCE
     transcripts (tone, Telugu+English code-mix, fillers,
     pauses, rhythm, teacher voice).
3. WHERE to place which point -> comes ONLY from the SKY DNA
     block (structure, ordering, promo placement, CTAs,
     PYQ/MCQ slots, motivation %).

HARD CONTENT BOUNDARY (most common failure -- avoid):
- The 4 reference transcripts are NOT a source of facts, topics,
  examples, names, dates, exams, departments or domain words.
  They are voice samples only.
- NEVER lift content from the transcripts. Do NOT mention
  "railway", "RRB", "IPL", "auction", a specific exam, a
  specific year, a specific scheme, a specific person or any
  example UNLESS that exact thing appears in the USER INPUT.
- If the user input is about SSC / Banking, the script must be
  about SSC / Banking only -- zero spillover from transcript
  topics.
- Do not invent stats, ranks, cut-offs, vacancy numbers, dates,
  winners, results, scores, prize money. If the user input does
  not give a number, do not write one.

TIME / RECENCY RULE:
- Today's date is ${today}. Treat anything dated before today as
  ALREADY HAPPENED (past tense). Do not say a completed event
  "is going to happen" or "మెగా ఆక్షన్ జరగబోతుంది" for an event
  that is already over. If unsure, speak generally without a
  year.

ABSOLUTE WORD-COUNT TARGET: approximately ${targetWords} Telugu words. Acceptable range: ${min}-${max}.

OUTPUT: Return ONLY the Telugu voiceover script as PLAIN TEXT (no JSON, no markdown, no fences, no preamble, no closing remarks).
- ONE continuous text, natural paragraph breaks with blank lines.
- Telugu Unicode only. ZERO Roman transliteration.
- ZERO emojis. ALL numbers as English words. Use "--" for pauses.

SKY DNA (WHERE / structure -- WHAT-to-place-WHERE):
${dna}

${TELUGU_TTS_MASTER_PROMPT}

STYLE REFERENCE (HOW to speak ONLY -- NOT a content source):
The blocks below are voice samples. Mimic the rhythm, fillers,
code-mix and teacher tone EXACTLY. Do NOT copy their topics,
facts, examples, names, numbers or domain words into this script.
${buildStyleRefs(overrides)}
`.trim();

}

function countWords(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

async function factCheckAndUpdate(
  supa: any,
  scriptId: string,
  script: string,
  factCheckModel: string,
  apiKey: string,
) {
  try {
    await supa.from("scripts").update({ status: "FACT_CHECKING" }).eq(
      "id",
      scriptId,
    );
    const fcRes = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: factCheckModel,
          messages: [
            { role: "system", content: FACT_CHECK_SYSTEM },
            {
              role: "user",
              content:
                `Fact-check this script. Return only the JSON object as instructed.\n\n--- SCRIPT START ---\n${script}\n--- SCRIPT END ---`,
            },
          ],
        }),
      },
    );
    let findings: any[] = [];
    let fcError: string | null = null;
    if (fcRes.ok) {
      const fcJson = await fcRes.json();
      const fcContent: string = fcJson?.choices?.[0]?.message?.content ?? "";
      try {
        let t = fcContent.trim().replace(/^```(?:json)?\s*/i, "").replace(
          /```\s*$/i,
          "",
        );
        const s = t.indexOf("{");
        const e = t.lastIndexOf("}");
        if (s !== -1 && e !== -1) t = t.slice(s, e + 1);
        const parsed = JSON.parse(t);
        findings = Array.isArray(parsed.findings) ? parsed.findings : [];
      } catch (e) {
        fcError = `parse error: ${(e as Error).message}`;
      }
    } else {
      fcError = `fact-check gateway ${fcRes.status}`;
    }
    await supa.from("scripts").update({
      fact_check_findings: {
        findings,
        error: fcError,
        checked_at: new Date().toISOString(),
        model: factCheckModel,
      },
      status: "FACT_CHECKED",
    }).eq("id", scriptId);
  } catch (e) {
    console.error("fact-check bg error", e);
    await supa.from("scripts").update({
      status: "FACT_CHECK_FAILED",
      script_error: String((e as Error)?.message ?? e).slice(0, 1000),
    }).eq("id", scriptId);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const body = (await req.json()) as Body;

    const inputMode = (body.inputMode ?? "idea") as
      | "topic"
      | "transcript"
      | "pdf"
      | "idea";
    const videoType =
      ((body.videoType ?? "general").toString().toUpperCase()) as
        | "GENERAL"
        | "SUBJECTIVE";
    const targetWords = Math.max(
      150,
      Math.min(5000, Number(body.wordCount) || 1800),
    );
    const model = body.model || "google/gemini-2.5-flash";
    const factCheckModel = body.factCheckModel || "google/gemini-3-pro-preview";

    const parts: string[] = [];
    if (body.topic) parts.push(`TOPIC / TITLE:\n${body.topic}`);
    if (body.chapterContext) {
      parts.push(`CHAPTER / IDEA CONTEXT:\n${body.chapterContext}`);
    }
    if (body.content) parts.push(`SOURCE MATERIAL:\n${body.content}`);
    if (body.specialInstructions) {
      parts.push(`SPECIAL INSTRUCTIONS:\n${body.specialInstructions}`);
    }
    if (parts.length === 0) {
      return new Response(JSON.stringify({ error: "No input provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    parts.push(
      `\nGenerate ONE continuous Telugu script of approximately ${targetWords} words. PLAIN TEXT ONLY.`,
    );
    const userPrompt = parts.join("\n\n");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY missing" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Pull training overrides
    const overrideKeys = [
      "training:transcript_1",
      "training:transcript_2",
      "training:transcript_3",
      "training:transcript_4",
      "training:sky_dna_general",
      "training:sky_dna_subjective",
    ];
    const { data: settingsRows } = await supa.from("app_settings").select(
      "key, value",
    ).in("key", overrideKeys);
    const settingsMap = new Map(
      (settingsRows ?? []).map((r: any) => [r.key, r.value]),
    );
    const readVal = (k: string): string | null => {
      const v = settingsMap.get(k);
      if (!v) return null;
      if (typeof v === "string") return v;
      if (typeof v === "object" && typeof v.text === "string") return v.text;
      return null;
    };
    const overrides: TrainingOverrides = {
      transcripts: [
        readVal("training:transcript_1"),
        readVal("training:transcript_2"),
        readVal("training:transcript_3"),
        readVal("training:transcript_4"),
      ],
      dna_general: readVal("training:sky_dna_general"),
      dna_subjective: readVal("training:sky_dna_subjective"),
    };

    const systemPrompt = buildSystemPrompt(
      videoType,
      inputMode,
      targetWords,
      overrides,
    );
    const title = body.title || body.topic || "SKY Academy Script";

    // Insert placeholder row up-front so the client gets a script_id early.
    const { data: row, error: insErr } = await supa.from("scripts").insert({
      idea_id: body.idea_id ?? null,
      title,
      content: "",
      word_count: 0,
      video_type: videoType,
      model,
      status: "STREAMING",
    }).select().single();
    if (insErr || !row) {
      return new Response(
        JSON.stringify({ error: "DB insert failed", detail: insErr?.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const scriptId = row.id as string;

    // Open AI gateway in streaming mode.
    const aiRes = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          stream: true,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      },
    );

    if (!aiRes.ok || !aiRes.body) {
      const t = await aiRes.text().catch(() => "");
      await supa.from("scripts").update({
        status: "FAILED",
        script_error: `AI gateway ${aiRes.status}: ${t.slice(0, 500)}`,
      }).eq("id", scriptId);
      return new Response(
        JSON.stringify({
          error: "AI gateway error",
          status: aiRes.status,
          detail: t.slice(0, 500),
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        // Send initial meta event so the client knows the script_id.
        controller.enqueue(
          encoder.encode(
            `event: meta\ndata: ${
              JSON.stringify({ script_id: scriptId, title })
            }\n\n`,
          ),
        );

        let full = "";
        let buffer = "";
        const reader = aiRes.body!.getReader();
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            // OpenAI-style SSE: lines starting with "data: "
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const payload = trimmed.slice(5).trim();
              if (!payload || payload === "[DONE]") continue;
              try {
                const j = JSON.parse(payload);
                const delta: string =
                  j?.choices?.[0]?.delta?.content ??
                    j?.choices?.[0]?.message?.content ?? "";
                if (delta) {
                  full += delta;
                  controller.enqueue(
                    encoder.encode(
                      `event: token\ndata: ${JSON.stringify({ t: delta })}\n\n`,
                    ),
                  );
                }
              } catch (_) {
                // ignore malformed chunk
              }
            }
          }
        } catch (e) {
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${
                JSON.stringify({ message: String((e as Error)?.message ?? e) })
              }\n\n`,
            ),
          );
        }

        // Strip any accidental JSON envelope the model emitted.
        let finalText = full.trim();
        finalText = finalText.replace(/^```(?:json)?\s*/i, "").replace(
          /```\s*$/i,
          "",
        );
        try {
          const obj = JSON.parse(finalText);
          if (typeof obj?.script === "string") finalText = obj.script.trim();
        } catch (_) {}

        const wc = countWords(finalText);

        // Save the final script row.
        await supa.from("scripts").update({
          content: finalText,
          word_count: wc,
          status: "SCRIPT_DONE",
        }).eq("id", scriptId);

        // Tell the client we're done streaming and kick off fact-check.
        controller.enqueue(
          encoder.encode(
            `event: done\ndata: ${
              JSON.stringify({ script_id: scriptId, word_count: wc })
            }\n\n`,
          ),
        );
        controller.close();

        // Fact-check in background (don't block the response).
        // @ts-ignore EdgeRuntime is provided by Supabase
        EdgeRuntime.waitUntil(
          factCheckAndUpdate(
            supa,
            scriptId,
            finalText,
            factCheckModel,
            LOVABLE_API_KEY,
          ),
        );
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String((e as Error)?.message ?? e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
