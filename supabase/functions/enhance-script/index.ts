import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { script } = await req.json();
    if (!script) {
      return new Response(JSON.stringify({ error: "Script text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call AI to enhance the script
    // We specify the Cartesia emotion tag format: <emotion value="emotion_name"/>
    // Available emotions: happy, excited, sad, angry, neutral, curious, serious, etc.
    const prompt = `
You are a "Script Enhancer" for an educational YouTube channel called "Sky Academy".
Your task is to take the provided script and "enhance" it by:
1. Adding intelligent punctuation (commas, full stops, exclamations) to improve flow and readability.
2. Adding line breaks for better pacing.
3. Adding emotion tags for the TTS engine (Cartesia). 

STRICT RULES:
- DO NOT CHANGE, ADD, OR REMOVE ANY WORDS OR LETTERS from the original script.
- ONLY add punctuation, line breaks, and emotion tags.
- Use the format: <emotion value="emotion_name"/> where emotion_name is one of: [happy, excited, sad, angry, curious, serious, neutral, enthusiastic, surprised, mysterious, confident, skeptical].
- Place emotion tags at the beginning of sentences or phrases where the tone should shift.
- Don't overdo the emotion tags; use them where they add value to the educational content.

ORIGINAL SCRIPT:
"""
${script}
"""

ENHANCED SCRIPT (Punctuation, line breaks, and emotions only):
`;

    const response = await fetch("https://api.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o", // Using a reliable model for punctuation tasks
        messages: [
          { role: "system", content: "You are a specialized tool that only adds punctuation, line breaks, and <emotion value='...'/> tags to scripts without changing any words." },
          { role: "user", content: prompt }
        ],
        temperature: 0.1, // Low temperature for precision
      }),
    });

    const data = await response.json();
    const enhancedScript = data.choices[0].message.content.trim();

    return new Response(JSON.stringify({ enhancedScript }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
