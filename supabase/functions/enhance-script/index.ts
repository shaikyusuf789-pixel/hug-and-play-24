import { TRANSCRIPT1, TRANSCRIPT2, TRANSCRIPT3 } from "./transcripts.ts";

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

    const apiKey = Deno.env.get("GOOGLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GOOGLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `
You are a "Script Enhancer" for an educational YouTube channel called "Sky Academy".
The output is fed DIRECTLY to the Cartesia TTS engine, which understands inline emotion tags
in the EXACT format: <emotion value="emotion_name"/>

================================================================
STYLE REFERENCE -- Sky's voice (3 transcripts, style only)
================================================================
Use these 3 transcripts as the reference for HOW Sky speaks (rhythm,
tone, code-mix). They are style samples only -- do not copy their
topics, facts or examples into the output.

--- TRANSCRIPT 1 ---
${TRANSCRIPT1}

--- TRANSCRIPT 2 ---
${TRANSCRIPT2}

--- TRANSCRIPT 3 ---
${TRANSCRIPT3}

================================================================

Your job is to enhance the provided script:

1. CONVERT EVERY NUMBER into context-aware spoken ENGLISH WORDS -- digits 0-9,
   Telugu numerals ౦-౯, AND Telugu number words written in Telugu script
   (e.g. రెండు వేల ఇరవై ఆరు, పదిహేను, వంద, వెయ్యి, లక్ష, కోటి). See NUMBER RULES below.

2. Add RICH PUNCTUATION (commas, em-dashes --, ellipses ..., periods, ?, !) at every
   natural breath point (every 4-7 words). Short punchy sentences > long flat ones.

3. Add HEAVY LINE BREAKS. Insert a blank line (\\n\\n) after every 1-2 sentences.
   No paragraph longer than 3 lines.

4. Add INLINE EMOTION TAGS in EXACT format <emotion value="name"/> -- at least once every
   2-3 sentences, at the start of each paragraph, and the moment tone shifts.
   Allowed emotions ONLY (lowercase): happy, excited, enthusiastic, elated, euphoric,
   triumphant, amazed, surprised, flirtatious, joking, comedic, curious, content, peaceful,
   serene, calm, grateful, affectionate, trust, sympathetic, anticipation, mysterious, angry,
   mad, outraged, frustrated, agitated, threatened, disgusted, contempt, envious, sarcastic,
   ironic, sad, dejected, melancholic, disappointed, hurt, guilty, bored, tired, rejected,
   nostalgic, wistful, apologetic, hesitant, insecure, confused, resigned, anxious, panicked,
   alarmed, scared, neutral, proud, confident, distant, skeptical, contemplative, determined.

HARD LIMITS -- you MUST NOT change any:
    * facts, statistics, numbers, dates, names, places, claims
    * meaning of any sentence
    * core information / order of ideas

NUMBER-TO-WORDS RULES (apply to digits, Telugu numerals, AND Telugu number words):

A) CONTEXT MATTERS -- pick one of three styles:

   1) CARDINAL -- quantities, amounts, marks, money, counts.
        "13000 students"          -> "thirteen thousand students"
        "Rs. 500" / "ఐదు వందల రూపాయలు" -> "rupees five hundred"
        "50%" / "యాభై శాతం"       -> "fifty percent"
        "1/2" / "ఒకటి రెండో వంతు"  -> "one by two"
        "13.5 marks"              -> "thirteen point five marks"

   2) YEAR-STYLE -- calendar years and exam years.
        "2026" / "రెండు వేల ఇరవై ఆరు"  -> "two thousand twenty six"
        "1947"                          -> "nineteen forty seven"

   3) DIGIT-GROUP / MODEL-NUMBER -- product names, model numbers, articles, sections,
      flights, codes, pins, jerseys, regiments. Read in NATURAL DIGIT GROUPS.
        "Boeing 737"   -> "Boeing seven thirty seven"
        "AK 47"        -> "AK forty seven"
        "Article 370"  -> "Article three seventy"
        "Section 144"  -> "Section one forty four"
        "Room 101"     -> "Room one oh one"

B) ORDINALS: "1st" -> "first", "21st" -> "twenty first".
C) DECIMALS: "13.5" -> "thirteen point five".
D) FRACTIONS: "1/2" -> "one by two".
E) Telugu-script numerals (౦-౯) AND Telugu number words must be rewritten as English words
   using the same context rules.

OTHER OUTPUT RULES:
- ABSOLUTELY NO MARKDOWN. No asterisks (* **), underscores (_), tildes (~), backticks,
  hash signs (#). TTS reads "*" as the word "asterisk".
- Emotion tag format is EXACTLY <emotion value="name"/> -- lowercase, self-closing slash,
  double quotes.
- Only the 60 allowed emotions.
- Return ONLY the enhanced script as plain text. No markdown fences, no preamble, no JSON.

ORIGINAL SCRIPT:
"""
${script}
"""

ENHANCED SCRIPT (numbers as English words + RICH punctuation + HEAVY breaks + frequent
Cartesia emotion tags, facts unchanged):
`;

    const systemInstruction = "You are a Telugu narration tool that (a) rewrites every number -- including digits, Telugu numerals, and Telugu number words like రెండు వేల ఇరవై ఆరు -- into context-aware spoken English words, and (b) adds rich punctuation, paragraph breaks, and inline Cartesia <emotion value=\"name\"/> tags using only the 60 allowed emotions, WITHOUT changing any facts, numbers, names, or meaning.";

    const model = "gemini-2.5-pro";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 16000 },
      }),
    });

    const raw = await response.text();
    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Google Gemini ${response.status}: ${raw.slice(0, 500)}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      return new Response(JSON.stringify({ error: `Non-JSON response from Gemini: ${raw.slice(0, 300)}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let enhancedScript = ((data?.candidates?.[0]?.content?.parts ?? [])
      .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
      .join("") || "").trim();
    if (!enhancedScript) {
      return new Response(JSON.stringify({ error: "Empty response from Gemini" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Strip markdown chars that break TTS pronunciation
    enhancedScript = enhancedScript
      .replace(/\*+/g, "")
      .replace(/`+/g, "")
      .replace(/_{2,}/g, "")
      .replace(/~+/g, "")
      .replace(/^#+\s*/gm, "")
      .replace(/\n{4,}/g, "\n\n\n");

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
