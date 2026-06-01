import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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

    const systemPrompt = `You are an expert script editor for SKY Academy. Your task is to split a long Telugu script into smaller chunks for video production.
Rules:
1. Each chunk MUST be between ${min} and ${max} words (target ~${target} words, word count is based on Telugu words).
2. Split the script intelligently at natural sentence boundaries or logical paragraph breaks.
3. DO NOT change the text content. Just split it verbatim.
4. Return the result as JSON with this exact shape: { "chunks": ["chunk 1 text...", "chunk 2 text..."] }`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Split this script into chunks of ${min}-${max} words each (target ~${target}):\n\n${scriptContent}`,
          },
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

    return { chunks };
  });
