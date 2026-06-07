import { TRANSCRIPT1, TRANSCRIPT2 } from "./transcripts.ts";

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
VOICE CLONE REFERENCE — Jerry's actual narration (2 transcripts)
================================================================
Study these 2 transcripts CAREFULLY. They are the gold standard for how Jerry speaks:
his fillers, his connectors, his rhythm, his sentence shapes, his pause habits.

--- TRANSCRIPT 1 ---
${TRANSCRIPT1}

--- TRANSCRIPT 2 ---
${TRANSCRIPT2}

================================================================

Your job is to enhance the provided script by doing FIVE things:

1. CONVERT EVERY NUMBER into context-aware spoken ENGLISH WORDS — this includes:
   (a) digits 0-9, (b) Telugu numerals ౦-౯, AND
   (c) **Telugu number WORDS written out in Telugu script**
       (e.g. రెండు వేల ఇరవై ఆరు, పదిహేను, వంద, వెయ్యి, లక్ష, కోటి, ముప్ఫై, యాభై, etc.)
   ALL of these must become English words. See NUMBER RULES below.

2. Add VERY RICH PUNCTUATION (commas, em-dashes --, ellipses ..., periods, ?, !) at every
   natural breath point (every 4-7 words). Short punchy sentences > long flat ones.

3. Add HEAVY LINE BREAKS. Insert blank line (\\n\\n) after every 1-2 sentences. NEVER let a
   paragraph exceed 3 lines. Inline \\n at soft pauses inside long sentences is fine.

4. Add INLINE EMOTION TAGS in EXACT format <emotion value="name"/> — at least once every
   2-3 sentences, at the start of each paragraph, and the moment tone shifts.
   Allowed emotions ONLY (lowercase): happy, excited, enthusiastic, elated, euphoric,
   triumphant, amazed, surprised, flirtatious, joking, comedic, curious, content, peaceful,
   serene, calm, grateful, affectionate, trust, sympathetic, anticipation, mysterious, angry,
   mad, outraged, frustrated, agitated, threatened, disgusted, contempt, envious, sarcastic,
   ironic, sad, dejected, melancholic, disappointed, hurt, guilty, bored, tired, rejected,
   nostalgic, wistful, apologetic, hesitant, insecure, confused, resigned, anxious, panicked,
   alarmed, scared, neutral, proud, confident, distant, skeptical, contemplative, determined.

5. **VOICE CLONE PASS — you MAY now slightly alter the original wording** to make the
   narration sound like Jerry from the 2 reference transcripts above. Specifically:
   - Insert Jerry's signature fillers and connectors at natural points: హలో ఎవ్రీ వన్,
     అంటే ఏంటంటే, అన్నమాట, కదా, ఓకే, మిత్రులారా, చూడండి, ఇప్పుడు, సో, ఏంటంటే,
     ఒకసారి చూసుకుందాము, ఏం జరిగింది అంటే, ఏం చేస్తారంటే.
   - Mirror his rhythm: short clauses chained with semicolons / em-dashes, repeating a key
     word for emphasis (e.g. "ఆధార్, ఆధార్ కి వెరిఫికేషన్…"), rhetorical questions
     followed by the answer.
   - Use Roman script for English loan words exactly like the transcripts
     (e.g. "ఎగ్జామ్", "నోటిఫికేషన్", "బయోమెట్రిక్").
   - HARD LIMITS — you may slightly reword, but you MUST NOT change any:
       * facts, statistics, numbers, dates, names, places, claims
       * meaning of any sentence
       * core information / order of ideas
   Think of it as "Jerry would say the same thing, but in his own words."

DENSITY EXAMPLE:

<emotion value="curious"/> మిత్రులారా -- ఇది ఒక చిన్న విషయం కాదు. చాలా పెద్ద విషయం!

<emotion value="amazed"/> ఆలోచించండి... కేవలం రెండు సంవత్సరాల్లో, ఈ కంపెనీ -- ఏకంగా twenty thousand crore rupees సంపాదించింది.

<emotion value="determined"/> మరి మీరు? మీరు కూడా ఇలాంటి స్థాయికి చేరుకోవాలంటే -- ఒక్క విషయం గుర్తుపెట్టుకోండి.

NUMBER-TO-WORDS RULES (apply to digits, Telugu numerals, AND Telugu number words):

A) CONTEXT MATTERS — pick one of three styles:

   1) CARDINAL — quantities, amounts, marks, money, counts.
        "13000 students"          -> "thirteen thousand students"
        "Rs. 500" / "ఐదు వందల రూపాయలు" -> "rupees five hundred"
        "50%" / "యాభై శాతం"       -> "fifty percent"
        "1/2" / "ఒకటి రెండో వంతు"  -> "one by two"
        "13.5 marks"              -> "thirteen point five marks"
        "ఇరవై వేల కోట్లు"          -> "twenty thousand crores"

   2) YEAR-STYLE — calendar years and exam years.
        "2026" / "రెండు వేల ఇరవై ఆరు"  -> "two thousand twenty six"
        "1947" / "పంతొమ్మిది వందల నలభై ఏడు" -> "nineteen forty seven"
        "SSC CGL 2026"                  -> "SSC CGL two thousand twenty six"

   3) DIGIT-GROUP / MODEL-NUMBER — product names, model numbers, articles, sections,
      flights, codes, pins, jerseys, regiments. Read in NATURAL DIGIT GROUPS,
      NEVER as "hundred/thousand".
        "Airbus H125 helicopter" -> "Airbus H one twenty five helicopter"
        "Boeing 737"             -> "Boeing seven thirty seven"
        "AK 47"                  -> "AK forty seven"
        "Article 370"            -> "Article three seventy"
        "Section 144"            -> "Section one forty four"
        "Room 101"               -> "Room one oh one"
        "Flight AI 202"          -> "Flight AI two oh two"
        "Pin code 500032"        -> "Pin code five double oh oh three two"

   Trigger for style 3: number attached to a brand/model/article/section/code/flight/pin/
   jersey/regiment, or any alphanumeric ID (H125, AK47, BR380). NEVER insert
   "hundred"/"thousand" for these.

B) ORDINALS: "1st"/"మొదటి" -> "first", "21st"/"ఇరవై ఒకటవ" -> "twenty first".

C) DECIMALS: "13.5" -> "thirteen point five", "3.14" -> "three point one four".

D) FRACTIONS: "1/2" -> "one by two", "3/4" -> "three by four".

E) Telugu-script numerals (౦-౯) AND Telugu number WORDS (ఒకటి, రెండు, మూడు, … పది,
   ఇరవై, ముప్ఫై, నలభై, యాభై, … వంద, వెయ్యి, లక్ష, కోటి, etc.) must ALL be
   rewritten as English words using the same context rules. This is non-negotiable.

F) SELF-CHECK before returning: scan the enhanced script. If you find ANY:
     - digit 0-9
     - Telugu numeral ౦-౯
     - English "1st/2nd/3rd" form
     - Telugu number word (ఒకటి/రెండు/.../వంద/వెయ్యి/లక్ష/కోటి/etc.) used as a quantity
   rewrite it in English words using the correct style above.

OTHER STRICT RULES:
- ABSOLUTELY NO MARKDOWN. No asterisks (* **), underscores (_), tildes (~), backticks (\`),
  hash signs (#). TTS reads "*" as the word "asterisk".
- Emotion tag format is EXACTLY <emotion value="name"/> — lowercase, self-closing slash,
  double quotes. Never <emotion>name</emotion> or other variants.
- Only the 60 allowed emotions.
- Return ONLY the enhanced script as plain text. No markdown fences, no preamble, no JSON,
  no explanations.

ORIGINAL SCRIPT:
"""
${script}
"""

ENHANCED SCRIPT (numbers as English words + RICH punctuation + HEAVY breaks + frequent
Cartesia emotion tags + Jerry's voice/style/fillers from the 2 reference transcripts):
`;

    const systemInstruction = "You are a Telugu narration tool that (a) rewrites every number — including digits, Telugu numerals, and Telugu number WORDS like రెండు వేల ఇరవై ఆరు — into context-aware spoken English words, (b) adds rich punctuation, paragraph breaks, and inline Cartesia <emotion value=\"name\"/> tags using only the 60 allowed emotions, and (c) slightly reshapes wording to mimic Jerry's narration style from the 2 reference transcripts (fillers, connectors, rhythm) WITHOUT changing any facts, numbers, names, or meaning.";

    const model = "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 16000 },
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
