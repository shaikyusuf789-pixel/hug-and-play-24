// supabase/functions/generate-script-stream/index.ts
// Streams script generation token-by-token via Server-Sent Events so the
// client can render live (Gemini-chat-style). After the stream completes,
// the final script is saved to the `scripts` table and fact-checking is
// fired in the background (EdgeRuntime.waitUntil).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { extractGeminiText, geminiGenerateJson, geminiStreamResponse, normalizeGeminiModel, requireGoogleApiKey } from "../_shared/google-ai.ts";
import {
  anthropicStreamResponse,
  extractAnthropicDelta,
  extractAnthropicStopReason,
  isClaudeModel,
  normalizeClaudeModel,
  requireAnthropicApiKey,
  type AnthropicMessage,
} from "../_shared/anthropic.ts";

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

function getSupabaseServiceKey() {
  return Deno.env.get("SUPABASE_SECRET_KEYS")?.match(/sb_secret_[A-Za-z0-9_-]+/)?.[0]
    ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    ?? Deno.env.get("CUSTOM_SUPABASE_SERVICE_ROLE_KEY")
    ?? "";
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

export function buildStyleBlock(overrides?: TrainingOverrides) {
  return `
================================================================
!!! VOICE CLONE LOCK -- READ EVERY WORD BEFORE WRITING !!!
================================================================
The THREE transcripts below are Sky's PERSONAL VOICEPRINT.
You are CLONING this exact human voice. HOW to speak (tone,
Telugu+English code-mix, pauses, rhythm, teacher voice) MUST be
copied from these 3 samples.

HARD CONTENT BOUNDARY:
- The 3 reference transcripts are NOT a source of facts, topics,
  examples, names, dates, exams, departments or domain words.
  They are VOICE SAMPLES only.
- NEVER lift content from the transcripts. Take facts ONLY from
  the USER INPUT below.

================================================================
STYLE REFERENCE -- HOW to speak (full transcripts):
================================================================
${buildStyleRefs(overrides)}
================================================================
END STYLE REFERENCE -- mimic the voice above, not the topics.
================================================================
`.trim();
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
  const today = new Date().toISOString().slice(0, 10);
  return `
You are an expert Telugu video script writer for sky academy.
${taskLine}

================================================================
THREE-LAYER RULE (DO NOT VIOLATE -- READ TWICE)
================================================================
1. WHAT to speak  -> comes ONLY from the USER INPUT (in the user message).
2. HOW to speak   -> comes ONLY from the 3 STYLE REFERENCE
     transcripts (in the user message). Tone, code-mix, pauses,
     rhythm, teacher voice.
3. WHERE to place which point -> comes ONLY from the SKY DNA
     block below (structure, ordering, promo placement, CTAs,
     PYQ/MCQ slots).

TIME / RECENCY RULE:
- Today's date is ${today}. Past-dated events are PAST TENSE.

================================================================
ABSOLUTE WORD-COUNT TARGET (HARDEST CONSTRAINT)
================================================================
- FINAL Telugu script MUST be approximately ${targetWords} words.
- Hard range: ${min} to ${max} whitespace-separated Telugu tokens.
- If source is short, EXPAND with on-topic exam context / examples / PYQs.
- If source is too long, CONDENSE without losing teaching.
- Stopping early (e.g. 600 words when ${targetWords} asked) is a CRITICAL FAILURE.

OUTPUT: Return ONLY the Telugu voiceover script as PLAIN TEXT (no JSON, no markdown, no fences, no preamble).
- ONE continuous text, natural paragraph breaks with blank lines.
- Telugu Unicode only. ZERO Roman transliteration.
- ZERO emojis. ALL numbers as English words. Use "--" for pauses.

SKY DNA (WHERE / structure -- WHAT-to-place-WHERE):
${dna}

${TELUGU_TTS_MASTER_PROMPT}
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
    const useClaude = isClaudeModel(body.model);
    const model = useClaude
      ? normalizeClaudeModel(body.model)
      : normalizeGeminiModel(body.model, "gemini-2.5-pro");
    const factCheckModel = normalizeGeminiModel(body.factCheckModel, "gemini-2.5-pro");

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
      `\nGenerate ONE continuous Telugu script of approximately ${targetWords} words (hard range ${Math.max(50, targetWords - 50)}-${targetWords + 50}). Do NOT stop before reaching ${Math.max(50, targetWords - 50)} words. If the source is short, EXPAND with sub-topics, examples, exam relevance, definitions and a recap around the SAME topic. PLAIN TEXT ONLY.`,
    );
    const userPrompt = parts.join("\n\n");

    let googleApiKey = "";
    try {
      // Google key is always required (fact-checker uses Gemini).
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

    let anthropicApiKey = "";
    if (useClaude) {
      try {
        anthropicApiKey = requireAnthropicApiKey();
      } catch (e) {
        return new Response(
          JSON.stringify({ error: (e as Error).message }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      getSupabaseServiceKey(),
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
    const styleBlock = buildStyleBlock(overrides);
    // Put the voice samples FIRST in the user turn so reasoning models
    // (gemini 3.x pro) and Claude don't skip them via "lost in the middle".
    const fullUserPrompt = `${styleBlock}\n\n================================================================\nUSER INPUT -- WHAT to speak about (facts/topic come ONLY from here):\n================================================================\n${userPrompt}\n\nFINAL REMINDER: Mimic the TONE / RHYTHM / CODE-MIX of the 3 REFERENCE TRANSCRIPTS above. Take FACTS only from the USER INPUT block. Follow the SKY DNA placement from the system prompt.`;
    // Initial placeholder title -- gets REPLACED with an AI-derived title
    // after generation completes (see deriveTitleFromText below).
    const rawTitle = (body.title || body.topic || "").trim();
    const isPlaceholder = !rawTitle || /^untitled/i.test(rawTitle) || rawTitle.toLowerCase() === "sky academy script";
    const title = isPlaceholder ? "Generating script…" : rawTitle;

    // PDF / transcript uploads without an existing idea: auto-create a
    // raw_content row in the Priority list so the script is selectable in
    // downstream phases (audio, chunks, annotations, etc).
    let effectiveIdeaId: string | null = body.idea_id ?? null;
    let createdNewIdea = false;
    if (!effectiveIdeaId && (inputMode === "pdf" || inputMode === "transcript")) {
      const { data: newIdea, error: ideaErr } = await supa
        .from("raw_content")
        .insert({
          original_title: title,
          status: "Priority",
          video_url: `${inputMode}://${(title || "upload").slice(0, 80)}`,
          processing_step: `${inputMode}_upload`,
        })
        .select("id")
        .single();
      if (ideaErr) {
        console.error("[generate-script-stream] auto-create idea failed", ideaErr);
      } else if (newIdea?.id) {
        effectiveIdeaId = newIdea.id as string;
        createdNewIdea = true;
      }
    }

    // Delete any prior scripts for this idea so regeneration truly replaces.
    if (effectiveIdeaId) {
      await supa.from("scripts").delete().eq("idea_id", effectiveIdeaId);
    }

    // Insert placeholder row up-front so the client gets a script_id early.
    const { data: row, error: insErr } = await supa.from("scripts").insert({
      idea_id: effectiveIdeaId,
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

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const MIN_WORDS = Math.max(50, targetWords - 50);
    const MAX_CONTINUATIONS = 3;

    const stream = new ReadableStream({
      async start(controller) {
        // Send initial meta event so the client knows the script_id + idea_id.
        controller.enqueue(
          encoder.encode(
            `event: meta\ndata: ${JSON.stringify({
              script_id: scriptId,
              title,
              idea_id: effectiveIdeaId,
              created_new_idea: createdNewIdea,
            })}\n\n`,
          ),
        );

        let full = "";
        let lastStopReason: string | null = null;
        let lastCheckpoint = 0;

        // Persist partial content to DB every ~400 chars so the script
        // survives crashes / browser closes / network drops. Without this,
        // an aborted stream leaves an empty STREAMING row that is invisible
        // in chunks/audio dropdowns.
        const checkpoint = async (force = false) => {
          if (!force && full.length - lastCheckpoint < 400) return;
          lastCheckpoint = full.length;
          try {
            await supa.from("scripts").update({
              content: full,
              word_count: countWords(full),
            }).eq("id", scriptId);
          } catch (e) {
            console.error("[generate-script-stream] checkpoint failed", e);
          }
        };

        // Drain one SSE response into `full`, streaming tokens to client.
        // Returns the final stop_reason (Claude only) or null.
        const drainResponse = async (resp: Response): Promise<string | null> => {
          let buffer = "";
          let stopReason: string | null = null;
          const reader = resp.body!.getReader();
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith("data:")) continue;
                const payload = trimmed.slice(5).trim();
                if (!payload || payload === "[DONE]") continue;
                try {
                  const j = JSON.parse(payload);
                  const delta: string = useClaude
                    ? extractAnthropicDelta(j)
                    : extractGeminiText(j);
                  if (delta) {
                    full += delta;
                    controller.enqueue(
                      encoder.encode(
                        `event: token\ndata: ${JSON.stringify({ t: delta })}\n\n`,
                      ),
                    );
                    await checkpoint();
                  }
                  if (useClaude) {
                    const sr = extractAnthropicStopReason(j);
                    if (sr) stopReason = sr;
                  }
                } catch (_) {
                  // ignore malformed chunk
                }
              }
            }
          } catch (e) {
            // Flush whatever we have + mark FAILED so the row is not stuck
            // in STREAMING with empty content (invisible to chunks/audio).
            await checkpoint(true);
            await supa.from("scripts").update({
              status: "FAILED",
              script_error: `stream interrupted: ${String((e as Error)?.message ?? e).slice(0, 300)}`,
            }).eq("id", scriptId);
            controller.enqueue(
              encoder.encode(
                `event: error\ndata: ${JSON.stringify({ message: String((e as Error)?.message ?? e) })}\n\n`,
              ),
            );
          }
          return stopReason;
        };

        // ----- First pass -----
        const firstRes = useClaude
          ? await anthropicStreamResponse(anthropicApiKey, {
              model,
              system: systemPrompt,
              user: fullUserPrompt,
              temperature: 0.2,
              maxTokens: Math.min(32000, Math.max(4096, targetWords * 8)),
            })
          : await geminiStreamResponse(googleApiKey, {
              model,
              system: systemPrompt,
              user: fullUserPrompt,
              temperature: 0.5,
              maxOutputTokens: 32000,
            });

        if (!firstRes.ok || !firstRes.body) {
          const t = await firstRes.text().catch(() => "");
          const providerLabel = useClaude ? "Anthropic" : "Google";
          await supa.from("scripts").update({
            status: "FAILED",
            script_error: `${providerLabel} ${firstRes.status}: ${t.slice(0, 500)}`,
          }).eq("id", scriptId);
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({
                message: `${providerLabel} AI error ${firstRes.status}: ${t.slice(0, 200)}`,
              })}\n\n`,
            ),
          );
          controller.close();
          return;
        }

        lastStopReason = await drainResponse(firstRes);
        console.log(`[generate-script-stream] first pass done: ${countWords(full)} words, stop_reason=${lastStopReason}`);

        // ----- Continuation loop (Claude only) -----
        // If Claude stopped short, prefill the previous output as an assistant
        // message and ask it to keep writing. Anthropic supports message
        // continuation natively. Up to MAX_CONTINUATIONS attempts.
        if (useClaude) {
          // Drift detector: ratio of ASCII letters in the tail of the script.
          // Telugu Unicode is U+0C00-U+0C7F; legitimate English tokens are rare.
          const romanDriftRatio = (s: string): number => {
            const tail = s.slice(-600);
            if (!tail) return 0;
            const letters = tail.match(/[A-Za-z]/g)?.length ?? 0;
            const nonSpace = tail.replace(/\s+/g, "").length || 1;
            return letters / nonSpace;
          };

          const STYLE_LOCK = [
            "================================================================",
            "STYLE LOCK -- READ BEFORE WRITING THE NEXT TOKEN",
            "================================================================",
            "1. TELUGU UNICODE ONLY. ZERO Roman/English transliteration of Telugu words.",
            "   FORBIDDEN: writing Telugu words in English letters (e.g. 'missile launched by personnel').",
            "   FORBIDDEN: copying English sentences from the SOURCE MATERIAL verbatim.",
            "2. REWRITE every source fact in sky academy Telugu teaching voice -- never paste source text.",
            "3. Every 2-3 sentences MUST include an <emotion value=\"...\"/> tag.",
            "4. Use \\n\\n paragraph breaks every 1-2 sentences. NO bulk dumps.",
            "5. All numbers as English words (Telugu speaker pronouncing English number words is OK).",
            "6. Use '--' for natural pauses. NO markdown, NO asterisks, NO bullets, NO headings.",
            "7. Follow the SKY DNA + STYLE REFERENCE transcripts from the system prompt -- they decide HOW you speak.",
            "================================================================",
          ].join("\n");

          let driftWarning = "";

          for (let attempt = 1; attempt <= MAX_CONTINUATIONS; attempt++) {
            const currentWords = countWords(full);
            if (currentWords >= MIN_WORDS) break;
            const needed = Math.max(200, targetWords - currentWords);
            const drift = romanDriftRatio(full);
            console.log(`[generate-script-stream] continuation ${attempt}: have ${currentWords}, need >= ${MIN_WORDS}, requesting +${needed}, drift=${drift.toFixed(2)}`);

            if (drift > 0.3) {
              driftWarning =
                `\n\nDRIFT DETECTED: the last paragraph contains too many English/Roman letters ` +
                `(${Math.round(drift * 100)}% Roman). You have drifted away from Telugu. ` +
                `BEFORE continuing, internally REWRITE the last paragraph in pure Telugu Unicode in your head, ` +
                `then continue ONLY in Telugu Unicode. Do NOT output any more English sentences.`;
            } else {
              driftWarning = "";
            }

            const contMessages: AnthropicMessage[] = [
              { role: "user", content: fullUserPrompt },
              { role: "assistant", content: full.trimEnd() },
              {
                role: "user",
                content:
                  STYLE_LOCK +
                  `\n\nCONTINUE the Telugu script from EXACTLY where you stopped. ` +
                  `Do NOT repeat any previous sentence. Do NOT summarize or close yet. ` +
                  `Write AT LEAST ${needed} more Telugu words on the SAME topic, ` +
                  `following the SKY DNA + STYLE REFERENCE transcripts (re-read them from the system prompt). ` +
                  `Keep going until the total reaches at least ${targetWords} words. ` +
                  `PLAIN TEXT Telugu Unicode only -- no JSON, no preamble, no English sentences.` +
                  driftWarning,
              },
            ];

            // Shorter continuations re-anchor the style more often.
            const contRes = await anthropicStreamResponse(anthropicApiKey, {
              model,
              system: systemPrompt,
              messages: contMessages,
              temperature: 0.2,
              maxTokens: Math.min(16000, Math.max(2048, needed * 4)),
            });
            if (!contRes.ok || !contRes.body) {
              const t = await contRes.text().catch(() => "");
              console.error(`[generate-script-stream] continuation ${attempt} failed: ${contRes.status} ${t.slice(0, 200)}`);
              break;
            }
            // Inject a soft space so words don't fuse across continuations.
            if (full && !/\s$/.test(full)) {
              full += " ";
              controller.enqueue(encoder.encode(`event: token\ndata: ${JSON.stringify({ t: " " })}\n\n`));
            }
            lastStopReason = await drainResponse(contRes);
            console.log(`[generate-script-stream] continuation ${attempt} done: total ${countWords(full)} words, stop_reason=${lastStopReason}, drift=${romanDriftRatio(full).toFixed(2)}`);
          }
        }

        // Strip any accidental JSON envelope the model emitted.
        let finalText = full.trim();
        finalText = finalText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
        try {
          const obj = JSON.parse(finalText);
          if (typeof obj?.script === "string") finalText = obj.script.trim();
        } catch (_) {}

        const wc = countWords(finalText);

        if (!finalText || wc === 0) {
          await supa.from("scripts").update({
            status: "FAILED",
            script_error: "Empty stream output",
          }).eq("id", scriptId);
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ message: "Empty script returned by model" })}\n\n`,
            ),
          );
          controller.close();
          return;
        }

        // ---- Derive a real title from the AI output ----
        // 1. If output is JSON segments -> use segments[0].title
        // 2. Else use first 8 meaningful words of the script (Telugu/English)
        const deriveTitle = (txt: string): string => {
          try {
            const arr = JSON.parse(txt);
            if (Array.isArray(arr) && arr.length > 0) {
              const t = String(arr[0]?.title || "").trim();
              if (t) return t.slice(0, 120);
            }
          } catch (_) { /* not JSON */ }
            const clean = txt.replace(/\s+/g, " ").trim();
            const words = clean.split(" ").filter(Boolean).slice(0, 8).join(" ");
            return (words || "Untitled Script").slice(0, 120);
        };
        const derivedTitle = deriveTitle(finalText);
        // If user provided a real title (PDF chapter context / topic), KEEP IT.
        // Only fall back to AI-derived title when the placeholder was used.
        const finalTitle = isPlaceholder ? derivedTitle : rawTitle;

        // Save the final script row.
        await supa.from("scripts").update({
          title: finalTitle,
          content: finalText,
          word_count: wc,
          status: "SCRIPT_DONE",
        }).eq("id", scriptId);

        // Also update the auto-created idea row so the dropdown label matches.
        if (effectiveIdeaId && createdNewIdea) {
          await supa.from("raw_content").update({
            original_title: finalTitle,
            proposed_title: finalTitle,
            status: "Script Done",
          }).eq("id", effectiveIdeaId);
        }

        controller.enqueue(
          encoder.encode(
            `event: done\ndata: ${JSON.stringify({
              script_id: scriptId,
              word_count: wc,
              target_words: targetWords,
              stop_reason: lastStopReason,
              idea_id: effectiveIdeaId,
              title: finalTitle,
            })}\n\n`,
          ),
        );
        controller.close();

        // Fact-check is now MANUAL — triggered via the "Fact Check" button
        // in the UI. Do NOT auto-run here.
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
