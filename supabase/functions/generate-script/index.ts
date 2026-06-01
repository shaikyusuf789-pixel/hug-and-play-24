// supabase/functions/generate-script/index.ts
// Generates a SKY Academy Telugu voiceover script as a SINGLE CONTINUOUS TEXT.
// No segments / no chunking here -- chunking happens later on the chunks page.

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

interface Body {
  topic?: string;
  content?: string;
  chapterContext?: string;
  videoType?: "subjective" | "general" | "SUBJECTIVE" | "GENERAL";
  inputMode?: "topic" | "transcript" | "pdf" | "idea";
  wordCount?: number;
  specialInstructions?: string;
  provider?: string;
  model?: string;
  idea_id?: string | null;
  title?: string;
  save?: boolean;
}

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
    ? "REWRITE the provided competitor transcript into ONE continuous SKY Academy Telugu voiceover script."
    : inputMode === "pdf"
    ? "ADAPT the provided book / PDF text into ONE continuous SKY Academy Telugu teaching voiceover."
    : "WRITE ONE complete, original SKY Academy Telugu voiceover script on the given topic / idea.";

  const min = Math.max(50, targetWords - 50);
  const max = targetWords + 50;

  return `
You are an expert Telugu video script writer for SKY Academy.
${taskLine}

================================================================
ABSOLUTE WORD-COUNT TARGET (HARDEST CONSTRAINT)
================================================================
- The final script MUST be approximately ${targetWords} Telugu words.
- Acceptable range: ${min} to ${max} words. NEVER outside this band.
- Count words as whitespace-separated tokens of the Telugu script.
- If the source material (topic / transcript / PDF) is too short to
  reach ${min} words, you MUST expand using your own general knowledge:
  relevant exam context, real-world examples, motivational angles,
  Indian polity / history / current affairs links, study tips, PYQ
  references, analogies, and SKY Academy-style anecdotes. NEVER stop
  short. NEVER pad with filler or repetition just to hit the count --
  add genuinely useful teaching content instead.
- If the source is too long, condense without losing meaning so the
  final length still falls inside ${min}-${max} words.

================================================================
OUTPUT FORMAT (STRICT)
================================================================
Return ONLY a valid JSON object, no markdown, no preamble, no fences:
{
  "script": "<the full Telugu voiceover as ONE continuous block of text>"
}
Rules for "script":
- ONE continuous text. Do NOT split into segments, chapters, headings,
  bullet points, or numbered sections.
- Use natural paragraph breaks (\\n\\n) where the anchor would pause.
- Telugu Unicode only. ZERO Roman transliteration of Telugu words.
- ZERO emojis.
- ALL numbers written as English words.
- Use "--" (double dash) for natural pauses.

================================================================
PRIORITY
================================================================
1. STYLE REFERENCE transcripts decide HOW to speak.
2. SKY DNA decides WHAT to speak.
If they conflict on style, STYLE REFERENCE wins.

Before writing ONE character, internally read every word of all four
STYLE REFERENCE transcripts and the SKY DNA block.

================================================================
SKY DNA (content rules)
================================================================
${dna}

${TELUGU_TTS_MASTER_PROMPT}

================================================================
STYLE REFERENCE -- HOW to speak (full transcripts, no truncation)
================================================================
${buildStyleRefs(overrides)}
================================================================
END STYLE REFERENCE
================================================================
`.trim();
}

function extractScriptText(raw: string): string {
  let t = raw.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  // Try strict JSON first.
  try {
    const obj = JSON.parse(t);
    if (typeof obj?.script === "string") return obj.script.trim();
  } catch (_) { /* fall through */ }
  // Try to locate first {...} block.
  const s = t.indexOf("{");
  const e = t.lastIndexOf("}");
  if (s !== -1 && e !== -1 && e > s) {
    try {
      const obj = JSON.parse(t.slice(s, e + 1));
      if (typeof obj?.script === "string") return obj.script.trim();
    } catch (_) { /* fall through */ }
  }
  // Last resort: return the raw text as the script.
  return t;
}

function countWords(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as Body;

    const inputMode = (body.inputMode ?? "topic") as
      | "topic" | "transcript" | "pdf" | "idea";
    const videoType =
      ((body.videoType ?? "subjective").toString().toUpperCase()) as
        "GENERAL" | "SUBJECTIVE";
    const targetWords = Math.max(
      150,
      Math.min(5000, Number(body.wordCount) || 660),
    );
    const model = body.model || "google/gemini-2.5-pro";
    const save = body.save !== false;

    // Build the user prompt from whichever inputs the frontend sent.
    const parts: string[] = [];
    if (body.topic) parts.push(`TOPIC / TITLE:\n${body.topic}`);
    if (body.chapterContext) {
      parts.push(`CHAPTER / IDEA CONTEXT:\n${body.chapterContext}`);
    }
    if (body.content) {
      const label = inputMode === "transcript"
        ? "SOURCE COMPETITOR TRANSCRIPT"
        : inputMode === "pdf"
        ? "SOURCE BOOK / PDF TEXT"
        : "SOURCE MATERIAL";
      parts.push(`${label}:\n${body.content}`);
    }
    if (body.specialInstructions) {
      parts.push(`SPECIAL INSTRUCTIONS (must be respected):\n${body.specialInstructions}`);
    }
    if (parts.length === 0) {
      return new Response(
        JSON.stringify({ error: "No input provided (topic / content / context all empty)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    parts.push(
      `\nGenerate ONE continuous Telugu script of approximately ${targetWords} words (range ${targetWords - 50}-${targetWords + 50}). Use your general knowledge to add motivation, exam relevance, examples, or strategy if the source is short. Return JSON: {"script":"..."} ONLY.`,
    );
    const userPrompt = parts.join("\n\n");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY missing on server" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Pull any boss-edited training overrides.
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
    const { data: settingsRows } = await supa
      .from("app_settings")
      .select("key, value")
      .in("key", overrideKeys);
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

    console.log("generate-script call", {
      inputMode, videoType, targetWords, model,
      topicLen: (body.topic ?? "").length,
      contentLen: (body.content ?? "").length,
      contextLen: (body.chapterContext ?? "").length,
      systemChars: systemPrompt.length,
    });

    const aiRes = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      },
    );

    if (!aiRes.ok) {
      const errTxt = await aiRes.text();
      console.error("AI gateway error", aiRes.status, errTxt);
      return new Response(
        JSON.stringify({
          error: "AI gateway error",
          status: aiRes.status,
          detail: errTxt,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiJson = await aiRes.json();
    const content: string = aiJson?.choices?.[0]?.message?.content ?? "";
    const script = extractScriptText(content);
    if (!script) {
      return new Response(
        JSON.stringify({ error: "Model returned empty script", raw: content }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const wordCount = countWords(script);
    const charCount = script.length;
    const title = body.title || body.topic || "SKY Academy Script";

    let scriptId: string | null = null;
    if (save) {
      const { data: scriptRow, error: scriptErr } = await supa
        .from("scripts")
        .insert({
          idea_id: body.idea_id ?? null,
          title,
          content: script,
          word_count: wordCount,
          video_type: videoType,
          model,
          status: "SCRIPT_DONE",
        })
        .select()
        .single();
      if (scriptErr) console.error("script insert error", scriptErr);
      else scriptId = scriptRow.id;
    }

    return new Response(
      JSON.stringify({
        success: true,
        script,
        word_count: wordCount,
        char_count: charCount,
        target_words: targetWords,
        title,
        script_id: scriptId,
        // Back-compat: keep `segments` as a 1-item array so any old caller still works.
        segments: [{ seg: 1, title, telugu_text: script }],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("generate-script fatal", e);
    return new Response(
      JSON.stringify({ error: String((e as Error)?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
