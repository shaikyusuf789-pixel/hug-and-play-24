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

// Deterministic chunker: the slider value is treated as the source of truth.
// It distributes the whole script evenly first, so the last chunk cannot collapse
// into 70/44-word leftovers, then nudges cuts to nearby sentence boundaries.
function chunkDeterministically(scriptContent: string, target: number, min: number, max: number): string[] {
  const normalized = normalizeSkyAcademy(scriptContent).replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const words = normalized.split(/\s+/).filter(Boolean);
  const chunkCount = chooseChunkCount(words.length, target, min, max);
  if (chunkCount <= 1) return [normalized];

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

    chunks.push(words.slice(start, end).join(" "));
    start = end;
  }

  chunks.push(words.slice(start).join(" "));
  return chunks.filter(Boolean);
}

export const processChunks = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      scriptContent: z.string().min(1),
      targetWords: z.number().int().min(50).max(500).optional(),
    })
  )
  .handler(async ({ data: { scriptContent, targetWords } }) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set in project secrets.");

    const target = targetWords ?? 185;
    const min = Math.max(20, target - 20);
    const max = target + 20;

    const systemPrompt = `You are an expert script editor for sky academy. Split a long Telugu script into chunks for video production.

STRICT RULES:
1. Each chunk MUST contain between ${min} and ${max} words (target ~${target} words). Count Telugu words as whitespace-separated tokens.
2. DO NOT produce chunks smaller than ${min} words. If the remaining text would be too short, merge it into the previous chunk.
3. Split at natural sentence/paragraph boundaries.
4. Preserve ALL original text verbatim — no edits, additions, deletions, or reordering.
5. Concatenating all chunks with a single space MUST reproduce the original script (whitespace-normalized).
6. Output ONLY JSON: { "chunks": ["...", "..."] }`;

    const userPrompt = `Split this script into chunks of ${min}-${max} words each (target ~${target}). Remember: NO chunk under ${min} words.

SCRIPT:
${scriptContent}`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.1,
        max_tokens: 16384,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`OpenAI failed: ${res.status} ${t}`);
    }

    const json: any = await res.json();
    const content: string = json.choices?.[0]?.message?.content ?? "";

    let chunks: string[] = [];
    try {
      const parsed = JSON.parse(content);
      chunks = Array.isArray(parsed) ? parsed : parsed.chunks ?? [];
    } catch (e) {
      console.error("Failed to parse AI response", content);
      throw new Error("AI returned invalid JSON for chunks.");
    }

    // Post-process: enforce min/max word bounds deterministically
    chunks = rebalance(chunks.filter((c) => typeof c === "string" && c.trim().length > 0), min, max, target);

    return { chunks };
  });
