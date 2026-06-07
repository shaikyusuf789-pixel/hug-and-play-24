import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function normalizeSkyAcademy(text: string): string {
  return text.replace(/\bSKY\s+Academy\b/g, "sky academy").replace(/\bSky\s+Academy\b/g, "sky academy");
}

function isSentenceEnd(word: string): boolean {
  return /[.!?।॥]$/.test(word) || /--$/.test(word);
}

function chooseChunkCount(totalWords: number, target: number, min: number, max: number): number {
  if (totalWords <= max) return 1;
  let count = Math.max(1, Math.round(totalWords / target));
  while (count > 1 && totalWords / count < min) count -= 1;
  while (totalWords / count > max) count += 1;
  return count;
}

function chooseBoundary(words: string[], start: number, idealEnd: number, minEnd: number, maxEnd: number): number {
  const lower = Math.max(start + 1, minEnd);
  const upper = Math.min(words.length, maxEnd);
  let best = Math.min(Math.max(idealEnd, lower), upper);
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let end = lower; end <= upper; end += 1) {
    if (!isSentenceEnd(words[end - 1] ?? "")) continue;
    const distance = Math.abs(end - idealEnd);
    if (distance < bestDistance) {
      best = end;
      bestDistance = distance;
    }
  }
  return best;
}

// Tokenize while preserving original whitespace (including newlines).
// Each token = { word, sep } where sep is the whitespace that FOLLOWED the word
// in the original text (empty string for the final token).
function tokenizeWithSeparators(text: string): { word: string; sep: string }[] {
  const tokens: { word: string; sep: string }[] = [];
  const re = /(\S+)(\s*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tokens.push({ word: m[1], sep: m[2] });
  }
  return tokens;
}

function joinTokens(tokens: { word: string; sep: string }[], start: number, end: number): string {
  let out = "";
  for (let i = start; i < end; i += 1) {
    out += tokens[i].word;
    // Use original separator, except trim trailing whitespace at chunk boundary.
    if (i < end - 1) out += tokens[i].sep;
  }
  return out;
}

// Deterministic fallback (used if AI fails or round-trip check fails).
// Preserves original line breaks/whitespace within each chunk.
function chunkDeterministically(scriptContent: string, target: number, min: number, max: number): string[] {
  const trimmed = scriptContent.trim();
  if (!trimmed) return [];
  const tokens = tokenizeWithSeparators(trimmed);
  const words = tokens.map((t) => t.word);
  const chunkCount = chooseChunkCount(words.length, target, min, max);
  if (chunkCount <= 1) return [joinTokens(tokens, 0, tokens.length)];

  const chunks: string[] = [];
  let start = 0;
  for (let chunkIndex = 0; chunkIndex < chunkCount - 1; chunkIndex += 1) {
    const remainingWords = words.length - start;
    const remainingChunks = chunkCount - chunkIndex;
    const chunksAfterThis = remainingChunks - 1;
    const idealSize = Math.round(remainingWords / remainingChunks);
    const idealEnd = start + idealSize;
    const minEnd = Math.max(start + 1, words.length - chunksAfterThis * max);
    const maxEnd = Math.min(words.length - chunksAfterThis, words.length - chunksAfterThis * min);
    const boundedMinEnd = Math.max(minEnd, start + Math.min(min, idealSize));
    const boundedMaxEnd = Math.max(boundedMinEnd, Math.min(maxEnd, start + Math.max(max, idealSize)));
    const end = chooseBoundary(words, start, idealEnd, boundedMinEnd, boundedMaxEnd);
    chunks.push(joinTokens(tokens, start, end));
    start = end;
  }
  chunks.push(joinTokens(tokens, start, tokens.length));
  return chunks.filter((c) => c.trim().length > 0);
}

// Normalize text for round-trip comparison: strip all whitespace + punctuation noise.
function canonical(s: string): string {
  return s.replace(/\s+/g, "").trim();
}

async function chunkWithGemini(script: string, target: number): Promise<string[] | null> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.warn("[chunks] GOOGLE_API_KEY missing — using deterministic fallback");
    return null;
  }

  const prompt = `You are splitting a Telugu/English script into chunks for video production.

RULES (priority order):
1. Each chunk must be ONE complete idea / topic beat / mini-scene. Never cut mid-thought, mid-sentence, mid-example, mid-quote, or mid-list.
2. Target ~${target} words per chunk. Going ${target - 50}–${target + 50} words is perfectly fine if the idea needs it. Intelligent boundary > exact word count.
3. Prefer breaks at: topic shifts, paragraph breaks, transition words (ఇప్పుడు, ఇక, కానీ, అయితే, మరో విషయం, so, now, but, however, next), or natural narrative pauses.
4. PRESERVE THE SCRIPT VERBATIM. Do not add, remove, paraphrase, translate, or reorder a single word. Concatenating all chunks (with single spaces) must equal the input.

Return ONLY a JSON object: {"chunks": ["chunk 1 text...", "chunk 2 text...", ...]}. No prose, no markdown fences.

SCRIPT:
"""
${script}
"""`;

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            maxOutputTokens: 32768,
          },
        }),
      }
    );

    if (!resp.ok) {
      console.error("[chunks] Gemini HTTP error", resp.status, await resp.text());
      return null;
    }

    const json = await resp.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!text) {
      console.error("[chunks] Gemini returned empty text");
      return null;
    }

    const parsed = JSON.parse(text);
    const chunks: unknown = parsed?.chunks;
    if (!Array.isArray(chunks) || chunks.some((c) => typeof c !== "string")) {
      console.error("[chunks] Gemini returned invalid chunks shape");
      return null;
    }
    const clean = (chunks as string[]).map((c) => c.trim()).filter(Boolean);
    if (clean.length === 0) return null;

    // Round-trip integrity check: ≤2% character delta vs original.
    const orig = canonical(script);
    const round = canonical(clean.join(" "));
    const delta = Math.abs(orig.length - round.length) / Math.max(1, orig.length);
    if (delta > 0.02) {
      console.warn(`[chunks] round-trip drift ${(delta * 100).toFixed(2)}% — fallback`);
      return null;
    }

    return clean;
  } catch (e) {
    console.error("[chunks] Gemini call failed", e);
    return null;
  }
}

export const processChunks = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      scriptContent: z.string().min(1),
      targetWords: z.number().int().min(50).max(500).optional(),
    })
  )
  .handler(async ({ data: { scriptContent, targetWords } }) => {
    const target = targetWords ?? 185;
    const min = Math.max(20, target - 50);
    const max = target + 50;

    const normalized = normalizeSkyAcademy(scriptContent).trim();

    let chunks = await chunkWithGemini(normalized, target);
    if (!chunks || chunks.length === 0) {
      chunks = chunkDeterministically(normalized, target, min, max);
    }

    return {
      chunks,
      stats: chunks.map((chunk) => countWords(chunk)),
    };
  });
