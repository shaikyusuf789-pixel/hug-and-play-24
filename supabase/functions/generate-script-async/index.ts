// supabase/functions/generate-script-async/index.ts
// Async version of generate-script: returns immediately with a script_id,
// runs script generation + fact-checking in background (EdgeRuntime.waitUntil).
// Avoids the 150s edge-function idle timeout.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { geminiGenerateJson, geminiGenerateText, normalizeGeminiModel, requireGoogleApiKey } from "../_shared/google-ai.ts";
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

const FACT_CHECK_SYSTEM = `You are a meticulous fact-checking research assistant for SSC / government-exam voiceover scripts (Telugu + English mix).

CURRENT DATE CONTEXT: Today is ${new Date().toISOString().slice(0, 10)} (year ${new Date().getUTCFullYear()}). Events from earlier in this year OR previous years are PAST events, NOT "future" or "speculative". Do NOT flag a claim as wrong just because it post-dates your training cutoff -- your training data is stale, the script is current.

GROUND-TRUTH RULES:
1. The user supplies real source transcripts / research material. Treat recent events (IPL seasons, exam notifications, vacancies, sports results, current affairs) referenced in the script as REAL unless you have HIGH-CONFIDENCE contradicting evidence from well-established historical facts.
2. NEVER flag a claim with reasoning like "this hasn't happened yet", "this is in the future", "cannot be verified because it's after my knowledge cutoff", or "speculative because year is 2026". These are INVALID reasons.
3. ONLY flag claims that are:
   - Mathematically/historically impossible (wrong year for India's independence, wrong capital, wrong constitutional article number, etc.)
   - Internally contradictory within the script
   - Contradicted by HARD established facts (e.g. claiming Sachin Tendulkar was born in 1990)
4. When in doubt about a recent event/stat, SKIP it -- do not flag.

OUTPUT: Return ONLY a JSON object: {"findings":[{"claim":"<exact wrong sentence from script>","issue":"<what is wrong>","correction":"<correct fact>","source":"<authority>","severity":"high|medium|low"}]}
If no genuine issues, return {"findings":[]}. Do not return anything else. No markdown, no commentary.`;

function buildStyleRefs(overrides?: TrainingOverrides) {
  return SKY_STYLE_TRANSCRIPTS
    .map(
      (t, i) =>
        `--- REFERENCE TRANSCRIPT ${i + 1}: ${t.name} ---\n${
          overrides?.transcripts?.[i] || t.text
        }\n--- END REFERENCE ${i + 1} ---`,
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
    ? "REWRITE the provided competitor transcript into ONE continuous sky academy Telugu voiceover script."
    : inputMode === "pdf"
    ? "ADAPT the provided book / PDF text into ONE continuous sky academy Telugu teaching voiceover."
    : "WRITE ONE complete, original sky academy Telugu voiceover script on the given topic / idea.";
  const min = Math.max(50, targetWords - 50);
  const max = targetWords + 50;
  return `
You are an expert Telugu video script writer for sky academy.
${taskLine}

ABSOLUTE WORD-COUNT TARGET: approximately ${targetWords} Telugu words. Acceptable range: ${min}-${max}.

OUTPUT: Return ONLY {"script":"<full Telugu voiceover as ONE continuous block>"} — no markdown, no fences.
- ONE continuous text, natural paragraph breaks with \\n\\n.
- Telugu Unicode only. ZERO Roman transliteration.
- ZERO emojis. ALL numbers as English words. Use "--" for pauses.

SKY DNA:
${dna}

${TELUGU_TTS_MASTER_PROMPT}

STYLE REFERENCE (HOW to speak):
${buildStyleRefs(overrides)}
`.trim();
}

function extractScriptText(raw: string): string {
  let t = raw.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  try {
    const obj = JSON.parse(t);
    if (typeof obj?.script === "string") return obj.script.trim();
  } catch (_) {}
  const s = t.indexOf("{");
  const e = t.lastIndexOf("}");
  if (s !== -1 && e !== -1 && e > s) {
    try {
      const obj = JSON.parse(t.slice(s, e + 1));
      if (typeof obj?.script === "string") return obj.script.trim();
    } catch (_) {}
  }
  return t;
}

function countWords(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

async function runBackground(
  supa: any,
  scriptId: string,
  systemPrompt: string,
  userPrompt: string,
  model: string,
  factCheckModel: string,
  apiKey: string,
) {
  try {
    // 1) Generate script
    const content = await geminiGenerateText(apiKey, {
      model,
      system: systemPrompt,
      user: userPrompt,
      temperature: 0.2,
      responseMimeType: "application/json",
    });
    const script = extractScriptText(content);
    const wc = countWords(script);

    await supa.from("scripts").update({
      content: script,
      word_count: wc,
      status: "SCRIPT_DONE",
    }).eq("id", scriptId);

    // 2) Fact-check
    await supa.from("scripts").update({ status: "FACT_CHECKING" }).eq(
      "id",
      scriptId,
    );

    let findings: any[] = [];
    let fcError: string | null = null;
    try {
      const parsed = await geminiGenerateJson<{ findings?: any[] }>(apiKey, {
        model: factCheckModel,
        system: FACT_CHECK_SYSTEM,
        user: `Fact-check this script. Return only JSON {"findings":[...]}.\n\n--- SCRIPT START ---\n${script}\n--- SCRIPT END ---`,
        temperature: 0.1,
      });
      findings = Array.isArray(parsed.findings) ? parsed.findings : [];
    } catch (e) {
      fcError = `fact-check error: ${(e as Error).message}`;
    }

    await supa.from("scripts").update({
      fact_check_findings: { findings, error: fcError, checked_at: new Date().toISOString(), model: factCheckModel },
      status: "FACT_CHECKED",
    }).eq("id", scriptId);
  } catch (e) {
    console.error("background error", e);
    await supa.from("scripts").update({
      status: "FAILED",
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
      | "topic" | "transcript" | "pdf" | "idea";
    const videoType =
      ((body.videoType ?? "general").toString().toUpperCase()) as
        "GENERAL" | "SUBJECTIVE";
    const targetWords = Math.max(
      150,
      Math.min(5000, Number(body.wordCount) || 1800),
    );
    const model = normalizeGeminiModel(body.model, "gemini-2.5-pro");
    const factCheckModel = normalizeGeminiModel(body.factCheckModel, "gemini-2.5-pro");

    const parts: string[] = [];
    if (body.topic) parts.push(`TOPIC / TITLE:\n${body.topic}`);
    if (body.chapterContext) {
      parts.push(`CHAPTER / IDEA CONTEXT:\n${body.chapterContext}`);
    }
    if (body.content) {
      parts.push(`SOURCE MATERIAL:\n${body.content}`);
    }
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
      `\nGenerate ONE continuous Telugu script of approximately ${targetWords} words. Return JSON {"script":"..."} ONLY.`,
    );
    const userPrompt = parts.join("\n\n");

    let googleApiKey = "";
    try {
      googleApiKey = requireGoogleApiKey();
    } catch (_) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_API_KEY missing" }),
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

    const title = body.title || body.topic || "sky academy Script";

    // Create placeholder row IMMEDIATELY
    const { data: row, error: insErr } = await supa.from("scripts").insert({
      idea_id: body.idea_id ?? null,
      title,
      content: "",
      word_count: 0,
      video_type: videoType,
      model,
      status: "PROCESSING",
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

    // Kick off background work
    // @ts-ignore - EdgeRuntime is available in Supabase edge runtime
    EdgeRuntime.waitUntil(
      runBackground(
        supa,
        row.id,
        systemPrompt,
        userPrompt,
        model,
        factCheckModel,
        googleApiKey,
      ),
    );

    return new Response(
      JSON.stringify({
        success: true,
        script_id: row.id,
        status: "PROCESSING",
        title,
        message:
          "Script generation + fact-checking started in background. Poll the scripts table for completion (status FACT_CHECKED or FAILED).",
      }),
      {
        status: 202,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
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
