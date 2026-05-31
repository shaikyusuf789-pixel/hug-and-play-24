import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { scriptContent } = await req.json();
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiKey) throw new Error("OPENAI_API_KEY is not set.");

    const systemPrompt = `
You are an expert script editor for SKY Academy. Your task is to split a long Telugu script into smaller chunks for video production.
Rules:
1. Each chunk MUST be between 170 and 200 words (word count is based on Telugu words).
2. Split the script intelligently at natural sentence boundaries or logical paragraph breaks.
3. DO NOT change the text content. Just split it verbatim.
4. Return the result as a JSON array of strings.
Example: ["chunk 1 text...", "chunk 2 text...", ...]
`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Split this script into chunks of 170-200 words each:\n\n${scriptContent}` },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
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

    return new Response(JSON.stringify({ chunks }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
