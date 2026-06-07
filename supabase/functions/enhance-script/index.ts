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
4. CONVERTING EVERY NUMBER (digits 0-9 and Telugu numerals ౦-౯) into spoken ENGLISH WORDS using CONTEXT.

NUMBER-TO-WORDS RULES (HARDEST RULE — apply to every digit, no exceptions):

A) CONTEXT MATTERS. Decide between three reading styles based on what the number means:

   1) CARDINAL ("normal counting") — quantities, amounts, marks, money, counts.
      Examples:
        "13000 students"   -> "thirteen thousand students"
        "Rs. 500"          -> "rupees five hundred"
        "50%"              -> "fifty percent"
        "1/2"              -> "one by two"
        "13.5 marks"       -> "thirteen point five marks"

   2) YEAR-STYLE ("two-pair" reading) — calendar years and exam years.
      Examples:
        "2026"             -> "two thousand twenty six"
        "1947"             -> "nineteen forty seven"
        "SSC CGL 2026"     -> "SSC CGL two thousand twenty six"
        "UPSC 2024 prelims"-> "UPSC twenty twenty four prelims"
      (Either "two thousand twenty six" OR "twenty twenty six" is acceptable; prefer "two thousand X" for 2000-2099 and "nineteen X" for 1900-1999.)

   3) DIGIT-GROUP / MODEL-NUMBER style — product names, model numbers, aircraft/helicopter/car/phone/missile numbers, room numbers, route numbers, jersey numbers, regiment numbers, flight numbers. Read in NATURAL DIGIT GROUPS, NEVER as "hundred/thousand".
      Examples (CRITICAL — copy this exact pattern):
        "Airbus H125 helicopter" -> "Airbus H one twenty five helicopter"   (NOT "H one hundred twenty five")
        "Boeing 737"             -> "Boeing seven thirty seven"
        "AK 47"                  -> "AK forty seven"
        "MiG 21"                 -> "MiG twenty one"
        "iPhone 15"              -> "iPhone fifteen"
        "Article 370"            -> "Article three seventy"               (NOT "three hundred seventy")
        "Section 144"            -> "Section one forty four"
        "Room 101"               -> "Room one oh one"
        "Flight AI 202"          -> "Flight AI two oh two"
        "Pin code 500032"        -> "Pin code five double oh oh three two" (digit by digit)
        "BR-380 missile"         -> "BR three eighty missile"

   How to choose style 3 vs style 1: if the number is attached to a brand,
   model, article/section, code, flight, pin, jersey, regiment, or any
   alphanumeric identifier (letters + digits like H125, AK47, BR380) — use
   DIGIT-GROUP reading. NEVER insert "hundred" or "thousand" for model/article numbers.

B) ORDINALS:
   "1st" -> "first", "2nd" -> "second", "21st" -> "twenty first".

C) DECIMALS read with "point" then digit-by-digit after the dot:
   "13.5" -> "thirteen point five",  "3.14" -> "three point one four".

D) FRACTIONS:
   "1/2" -> "one by two",  "3/4" -> "three by four".

E) Telugu-script numerals (౦-౯) and Telugu number words inside Telugu sentences
   must ALSO be rewritten as English words using the same rules above
   (because the output feeds a TTS engine that pronounces English-word numbers
   cleanly).

F) Self-check before returning: scan the enhanced script. If you find ANY
   digit 0-9, any Telugu numeral ౦-౯, or any "1st/2nd/3rd" form left,
   rewrite that token in English words using the correct style above.

OTHER STRICT RULES:
- DO NOT CHANGE, ADD, OR REMOVE ANY WORDS OR LETTERS apart from the number-to-words rewrites described above and the punctuation / line-break / emotion-tag additions.
- Use the format: <emotion value="emotion_name"/> where emotion_name is one of: [happy, excited, sad, angry, curious, serious, neutral, enthusiastic, surprised, mysterious, confident, skeptical].
- Place emotion tags at the beginning of sentences or phrases where the tone should shift.
- Don't overdo the emotion tags; use them where they add value to the educational content.
- Return ONLY the enhanced script as plain text. No markdown fences, no preamble, no JSON.

ORIGINAL SCRIPT:
"""
${script}
"""

ENHANCED SCRIPT (numbers converted to context-aware English words, plus punctuation, line breaks, and emotions):
`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a specialized tool that (a) rewrites EVERY number into context-aware spoken English words (years vs cardinals vs model/article numbers), and (b) adds punctuation, line breaks, and <emotion value='...'/> tags. You never add or remove any other words." },
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
