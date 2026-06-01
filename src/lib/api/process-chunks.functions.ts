import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { geminiGenerateText } from "@/lib/google-ai";

export const processChunks = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      scriptContent: z.string().min(1),
      targetWords: z.number().int().min(50).max(500).optional(),
    })
  )
  .handler(async ({ data: { scriptContent, targetWords } }) => {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_API_KEY is not set in project secrets.");

    const target = targetWords ?? 185;
    const min = Math.max(20, target - 20);
    const max = target + 20;

    const systemPrompt = `
You are an expert script editor for SKY Academy. Your task is to split a long Telugu script into smaller chunks for video production.
Rules:
1. Each chunk MUST be between ${min} and ${max} words (target ~${target} words, word count is based on Telugu words).
2. Split the script intelligently at natural sentence boundaries or logical paragraph breaks.
3. DO NOT change the text content. Just split it verbatim.
4. Return the result as a JSON array of strings.
Example: ["chunk 1 text...", "chunk 2 text...", ...]
`;

    const result_content = await geminiGenerateText(apiKey, {
      model: "gemini-2.5-flash-lite",
      system: systemPrompt,
      user: `Split this script into chunks of ${min}-${max} words each (target ~${target}):\n\n${scriptContent}`,
      temperature: 0.1,
      responseMimeType: "application/json",
    });

    let chunks: string[] = [];
    try {
      const cleaned = result_content.replace(/```json/g, "").replace(/```/g, "").trim();
      chunks = JSON.parse(cleaned);
    } catch (e) {
      console.error("Failed to parse AI response", result_content);
      throw new Error("AI returned invalid JSON for chunks.");
    }

    return { chunks };
  });
