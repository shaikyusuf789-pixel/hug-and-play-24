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
The output is fed DIRECTLY to the Cartesia TTS engine, which understands inline emotion tags
in the EXACT format: <emotion value="emotion_name"/>

Your job is to enhance the provided script by doing FOUR things, and ONLY these four things:

1. CONVERT EVERY NUMBER into context-aware spoken ENGLISH WORDS (see NUMBER-TO-WORDS RULES below — unchanged).
2. Add INTELLIGENT PUNCTUATION (commas, full stops, em-dashes —, ellipses …, question marks, exclamation marks)
   to mirror how a confident teacher would actually speak the line. Don't over-punctuate; use punctuation
   where the narration would naturally breathe.
3. Add LINE BREAKS so the script reads as short paragraphs (1–3 sentences each) separated by a blank line.
   This gives Cartesia clean prosody chunks and helps the downstream chunking engine.
4. Add INLINE EMOTION TAGS in the EXACT Cartesia format: <emotion value="excited"/>
   - Place a tag at the START of a sentence or clause where the emotional tone shifts.
   - Use them liberally enough to make the narration feel alive, but NOT on every sentence —
     a new tag is only needed when the emotion actually changes.
   - You MUST pick emotion_name from this exact list (no synonyms, no new emotions, lowercase only):
     happy, excited, enthusiastic, elated, euphoric, triumphant, amazed, surprised, flirtatious,
     joking, comedic, curious, content, peaceful, serene, calm, grateful, affectionate, trust,
     sympathetic, anticipation, mysterious, angry, mad, outraged, frustrated, agitated, threatened,
     disgusted, contempt, envious, sarcastic, ironic, sad, dejected, melancholic, disappointed,
     hurt, guilty, bored, tired, rejected, nostalgic, wistful, apologetic, hesitant, insecure,
     confused, resigned, anxious, panicked, alarmed, scared, neutral, proud, confident, distant,
     skeptical, contemplative, determined.
   - Match the emotion to the actual content: facts → confident / neutral, surprising stats →
     amazed / surprised, sad history → melancholic / sympathetic, motivation → enthusiastic /
     determined, mystery / suspense → mysterious / curious, warnings → alarmed / serious-leaning
     tags like determined or anxious, jokes → joking or comedic, etc.

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
- DO NOT CHANGE, ADD, OR REMOVE ANY WORDS OR LETTERS apart from (a) the number-to-words rewrites,
  (b) added punctuation, (c) added line breaks, and (d) added <emotion value="..."/> tags.
- Emotion tag format is EXACTLY <emotion value="name"/> — lowercase name, self-closing slash,
  double quotes. Never use <emotion>name</emotion> or any other variant.
- Use ONLY the 60 emotions in the list above. Never invent new ones.
- Return ONLY the enhanced script as plain text. No markdown fences, no preamble, no JSON, no explanations.

ORIGINAL SCRIPT:
"""
${script}
"""

ENHANCED SCRIPT (numbers as words + rich punctuation + paragraph breaks + Cartesia emotion tags):
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
