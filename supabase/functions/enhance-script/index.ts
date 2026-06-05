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

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
- Return ONLY the enhanced script as plain text. No markdown fences, no preamble, no JSON.

ORIGINAL SCRIPT:
"""
${script}
"""

ENHANCED SCRIPT (Punctuation, line breaks, and emotions only):
`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a specialized tool that only adds punctuation, line breaks, and <emotion value='...'/> tags to scripts without changing any words." },
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
      }),
    });

    const raw = await response.text();
    if (!response.ok) {
      return new Response(JSON.stringify({ error: `OpenAI ${response.status}: ${raw.slice(0, 500)}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      return new Response(JSON.stringify({ error: `Non-JSON response from OpenAI: ${raw.slice(0, 300)}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const enhancedScript = (data?.choices?.[0]?.message?.content ?? "").trim();
    if (!enhancedScript) {
      return new Response(JSON.stringify({ error: "Empty response from OpenAI" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
