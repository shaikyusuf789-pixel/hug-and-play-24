import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

export const processChunks = createServerFn({ method: "POST" })
  .inputValidator(z.object({ scriptContent: z.string() }))
  .handler(async ({ data: { scriptContent } }) => {
    console.log("Splitting chunks via Fallback ServerFn...");
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_API_KEY is not set in project secrets.");

    const systemPrompt = `
You are an expert script editor for SKY Academy. Your task is to split a long Telugu script into smaller chunks for video production.
Rules:
1. Each chunk MUST be between 170 and 200 words (word count is based on Telugu words).
2. Split the script intelligently at natural sentence boundaries or logical paragraph breaks.
3. DO NOT change the text content. Just split it verbatim.
4. Return the result as a JSON array of strings.
Example: ["chunk 1 text...", "chunk 2 text...", ...]
`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Split this script into chunks of 170-200 words each:\n\n${scriptContent}` },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google AI error: ${response.status} ${errorText}`);
    }

    const aiData = await response.json();
    const result_content = aiData.choices[0].message.content;
    
    let chunks = [];
    try {
      const cleaned = result_content.replace(/```json/g, "").replace(/```/g, "").trim();
      chunks = JSON.parse(cleaned);
    } catch (e) {
      console.error("Failed to parse AI response", result_content);
      throw new Error("AI returned invalid JSON for chunks.");
    }

    return { chunks };
  });


