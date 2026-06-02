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
    const target = targetWords ?? 185;
    const min = Math.max(20, target - 20);
    const max = target + 20;
    const chunks = chunkDeterministically(scriptContent, target, min, max);

    return {
      chunks,
      stats: chunks.map((chunk) => countWords(chunk)),
    };
  });
