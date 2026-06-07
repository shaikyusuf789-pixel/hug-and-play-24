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

2. Add VERY RICH PUNCTUATION. The current narration sounds robotic because punctuation is too sparse.
   - Add commas, em-dashes (--), ellipses (...), full stops, question marks, exclamation marks AGGRESSIVELY.
   - A natural Telugu teacher pauses every 4-7 words. Mirror that: insert a comma, dash, or period at EVERY natural breath point — do NOT let sentences run more than ~10 words without a pause mark.
   - Use em-dash (--) for dramatic pause, ellipsis (...) for suspense / trailing thought, exclamation (!) for surprise/excitement, question mark (?) for rhetorical questions.
   - Short, punchy sentences > long flat ones. Break long sentences into 2 or 3 shorter ones with a period or em-dash.

3. Add HEAVY LINE BREAKS. The narration MUST visually look like a poem, not a paragraph wall.
   - After EVERY 1 to 2 sentences, insert a blank line (\\n\\n) so paragraphs stay TINY (1-2 sentences max).
   - Inside a long sentence, you may also add a single \\n at a natural pause to force a soft break.
   - NEVER output a paragraph longer than 3 lines. If it's longer, split it.

4. Add INLINE EMOTION TAGS in the EXACT Cartesia format: <emotion value="excited"/>
   - Use them LIBERALLY — at least once every 2-3 sentences, ideally at the start of each new paragraph.
   - Insert a new tag the moment the emotional tone shifts (curiosity -> excitement -> seriousness -> motivation, etc.). Narration must feel ALIVE, never flat.
   - You MUST pick emotion_name from this exact list (no synonyms, no new emotions, lowercase only):
     happy, excited, enthusiastic, elated, euphoric, triumphant, amazed, surprised, flirtatious,
     joking, comedic, curious, content, peaceful, serene, calm, grateful, affectionate, trust,
     sympathetic, anticipation, mysterious, angry, mad, outraged, frustrated, agitated, threatened,
     disgusted, contempt, envious, sarcastic, ironic, sad, dejected, melancholic, disappointed,
     hurt, guilty, bored, tired, rejected, nostalgic, wistful, apologetic, hesitant, insecure,
     confused, resigned, anxious, panicked, alarmed, scared, neutral, proud, confident, distant,
     skeptical, contemplative, determined.
   - Match emotion to content: facts -> confident/neutral, stats -> amazed/surprised, sad history -> melancholic/sympathetic, motivation -> enthusiastic/determined, mystery -> mysterious/curious, warnings -> alarmed/determined, jokes -> joking/comedic.

DENSITY EXAMPLE (this is the level of punctuation, breaks, and emotion you MUST produce):

<emotion value="curious"/> మిత్రులారా -- ఇది ఒక చిన్న విషయం కాదు. చాలా పెద్ద విషయం!

<emotion value="amazed"/> ఆలోచించండి... కేవలం రెండు సంవత్సరాల్లో, ఈ కంపెనీ -- ఏకంగా ఇరవై వేల కోట్ల రూపాయలు సంపాదించింది.

<emotion value="determined"/> మరి మీరు? మీరు కూడా ఇలాంటి స్థాయికి చేరుకోవాలంటే -- ఒక్క విషయం గుర్తుపెట్టుకోండి.

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
   must ALSO be rewritten as English words using the same rules above.

F) Self-check before returning: scan the enhanced script. If you find ANY
   digit 0-9, any Telugu numeral ౦-౯, or any "1st/2nd/3rd" form left,
   rewrite that token in English words using the correct style above.

OTHER STRICT RULES:
- DO NOT CHANGE, ADD, OR REMOVE ANY WORDS OR LETTERS apart from (a) the number-to-words rewrites,
  (b) added punctuation, (c) added line breaks, and (d) added <emotion value="..."/> tags.
- ABSOLUTELY NO MARKDOWN. Never output asterisks (* or **), underscores (_), tildes (~), backticks (\`), or hash signs (#). These break TTS pronunciation (TTS reads "*" as the letter "asterisk").
- Emotion tag format is EXACTLY <emotion value="name"/> — lowercase name, self-closing slash, double quotes. Never use <emotion>name</emotion> or any other variant.
- Use ONLY the 60 emotions in the list above.
- Return ONLY the enhanced script as plain text. No markdown fences, no preamble, no JSON, no explanations.

ORIGINAL SCRIPT:
"""
${script}
"""

ENHANCED SCRIPT (numbers as words + RICH punctuation + HEAVY paragraph breaks + frequent Cartesia emotion tags):
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
          { role: "system", content: "You are a specialized tool that (a) rewrites EVERY number into context-aware spoken English words (years vs cardinals vs model/article numbers), and (b) adds rich punctuation, paragraph line breaks, and inline Cartesia emotion tags in the EXACT format <emotion value=\"name\"/> using ONLY the 60 allowed emotions. You never add or remove any other words." },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
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
