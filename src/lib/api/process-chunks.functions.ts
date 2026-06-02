import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

// Deterministic re-balancer: ensures every chunk (except possibly the last)
// has at least `min` words by merging undersized chunks with their neighbour,
// and splits oversized chunks at sentence boundaries.
function rebalance(chunks: string[], min: number, max: number, target: number): string[] {
  // 1) Merge tiny chunks forward
  const merged: string[] = [];
  for (const c of chunks) {
    const text = c.trim();
    if (!text) continue;
    if (merged.length === 0) {
      merged.push(text);
      continue;
    }
    const prev = merged[merged.length - 1];
    if (countWords(prev) < min) {
      merged[merged.length - 1] = prev + " " + text;
    } else {
      merged.push(text);
    }
  }
  // Final pass: if last chunk is tiny, fold it into previous
  if (merged.length > 1 && countWords(merged[merged.length - 1]) < min) {
    const tail = merged.pop()!;
    merged[merged.length - 1] = merged[merged.length - 1] + " " + tail;
  }

  // 2) Split oversized chunks at sentence boundaries
  const out: string[] = [];
  for (const c of merged) {
    if (countWords(c) <= max) {
      out.push(c);
      continue;
    }
    // Split at sentence-ish boundaries (. ! ? । ॥ or newline)
    const sentences = c.match(/[^.!?।॥\n]+[.!?।॥\n]?/g) ?? [c];
    let buf = "";
    for (const s of sentences) {
      const candidate = buf ? buf + " " + s.trim() : s.trim();
      if (countWords(candidate) >= target) {
        out.push(candidate);
        buf = "";
      } else {
        buf = candidate;
      }
    }
    if (buf) {
      if (out.length > 0 && countWords(buf) < min) {
        out[out.length - 1] = out[out.length - 1] + " " + buf;
      } else {
        out.push(buf);
      }
    }
  }
  return out;
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

    const systemPrompt = `You are an expert script editor for SKY Academy. Split a long Telugu script into chunks for video production.

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
