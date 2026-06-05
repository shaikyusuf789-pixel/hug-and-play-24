// Deno-side mirror of src/lib/script-generator-prompts.ts
// Style transcripts are ALWAYS injected in full (no truncation).
// SKY DNA decides WHAT to say; transcripts decide HOW to say it.
//
// At runtime, generate-script/index.ts may pass `overrides` fetched from the
// `app_settings` table (keys: training:transcript_1..4, training:sky_dna_general,
// training:sky_dna_subjective) so Jerry / boss can edit them live.

import { SKY_STYLE_TRANSCRIPTS } from "./transcripts.ts";

export type TrainingOverrides = {
  transcripts?: (string | null | undefined)[]; // index 0..3 -> transcript 1..4
  dna_general?: string | null;
  dna_subjective?: string | null;
};

function buildStyleReferenceBlock(overrides?: TrainingOverrides) {
  return SKY_STYLE_TRANSCRIPTS
  .map(
    (t, i) =>
      `--- REFERENCE TRANSCRIPT ${i + 1}: ${t.name} ---\n${overrides?.transcripts?.[i] || t.text}\n--- END REFERENCE ${i + 1} ---`,
  )
  .join("\n\n");
}

function buildStyleReferenceInstructions(overrides?: TrainingOverrides) {
  return `
================================================================
STYLE REFERENCE -- HIGHEST PRIORITY (HOW to speak)
================================================================
Below are FOUR real sky academy video transcripts (full text, no truncation).
Before writing a single line, READ EVERY ALPHABET AND EVERY WORD of all four
transcripts. No skipping, no skimming, no exemptions. Internally study them
and mimic EXACTLY:

  - Telugu word choice and code-mixing (English technical terms inside
    Telugu sentences, exactly the way the SKY anchor uses them).
  - Sentence rhythm, length and natural pauses ("--", "...", short
    re-statements like "ఓకే", "అంటే", "చూడండి").
  - Filler / connector words actually used by the anchor
    (e.g. "అయితే", "సో", "మరి", "అంటే ఏంటంటే", "ఇప్పుడు చూడండి",
    "ఒకసారి చూసుకుందాము", "ఓకే వచ్చేద్దాం").
  - Direct address to the student ("మీరు", "మీకు"), rhetorical
    questions immediately answered.
  - Teacher-in-classroom pacing: slow, repeat the key word, then
    explain with a small example.

These 4 transcripts OVERRIDE any tonal hint that may appear elsewhere.
For language, styling, word formation, filler words and toning -- copy
this voice. Do NOT invent a new tone.

${buildStyleReferenceBlock(overrides)}
================================================================
END STYLE REFERENCE
================================================================
`;
}

// Back-compat export (uses bundled fallback only).
export const STYLE_REFERENCE_INSTRUCTIONS = buildStyleReferenceInstructions();

export const TELUGU_TTS_MASTER_PROMPT = `
================================================================
Telugu Voice Output -- Hard Rules
================================================================
All Telugu content in telugu_text MUST use Telugu Unicode script.
Never use Roman transliteration for Telugu words.
Use "--" (double dash) for natural pauses.
Questions must be answered immediately.
Every line must be meaningful.

(Voice tone, pacing and filler-word style are defined ONLY by the
STYLE REFERENCE transcripts -- do not duplicate those rules here.)
`;

export const OUTPUT_FORMAT = `
Return ONLY a valid JSON array. No preamble, no markdown fences, no explanation.
[
  {
    "seg": 1,
    "title": "3-5 word English heading",
    "telugu_text": "full voiceover in TELUGU UNICODE SCRIPT -- NO EMOJIS"
  }
]
- Generate exactly {NUM_SEGS} segments
- Each segment MUST be 150-180 words
- ALL Telugu words in Telugu Unicode script
- ALL numbers written as English words
`;

const PROMOTIONS_BLOCK = `
MANDATORY PROMOTIONS (insert each ONE TIME, ONCE EACH, at the most natural
and apt place inside the script -- never two in a row, never at the very
opening, never crammed at the end. They MUST feel like the mentor is
casually telling students, NOT like an advertisement. Weave them into the
flow using the same tone, fillers and code-mix as the surrounding script.):

PROMO A -- TELEGRAM CHANNEL (free resources + updates):
  Tell students to join the free Telegram channel for free study materials,
  quick updates, important alerts and many more useful resources -- "link
  description lo undi" style. Place this at a point where you just finished
  giving a useful tip or resource, so it feels like a natural extension.

PROMO B -- WHATSAPP MENTORSHIP (doubts + motivation + demo):
  Tell students they can text on WhatsApp for all their doubts,
  clarifications, motivation, and to book a free mentorship demo --
  "WhatsApp number description lo unnadi" style. Place this where students
  would emotionally need support (after a tough-topic explanation, after a
  motivational beat, or near discussion of personal struggles).

PROMO C -- sky academy APP + 360 DEGREE STRONG HOLD PREPARATION:
  Naturally mention the sky academy app offerings:
    - Full video courses for all competitive exams
    - PDFs
    - Quizzes
    - Section-wise tests
    - Full-length mocks
  THEN, most importantly, explain the PRIVATE TELEGRAM MENTORSHIP SYSTEM
  in the same breath:
    - Each student is added into a private group
    - Only the mentor, the tutor and the students are inside
    - Personal monitoring of every single student
    - Daily morning schedules
    - Daily evening tests
    - Topic-wise analysis
    - Continuous guidance and real accountability
  Describe this whole package as "360 degree strong hold preparation".
  Place this where the script is talking about serious preparation,
  discipline, or "how to actually crack the exam" -- so it lands as the
  natural answer to that need, not as a sales pitch.

HARD RULES for all 3 promos:
  - Each promo appears EXACTLY ONCE in the full script. No repetition.
  - Spread them out across different segments -- never back-to-back.
  - Use the SAME Telugu+English code-mix and filler style as the rest of
    the script (refer STYLE REFERENCE transcripts).
  - Tone must be mentor-to-student, motivational and helpful -- NEVER
    advertisement-style, NEVER "buy now" energy.
  - Do NOT add any new promo, link or product beyond A, B and C above.
`;

const CONTENT_MIX_BLOCK = `
================================================================
CONTENT COMPOSITION -- INGREDIENT MIX (HARD QUOTA)
================================================================
The script must be a MIX of ingredients, NOT a juice of one fruit.
Across the FULL script (sum of all segments), the word-budget MUST be
distributed approximately as follows. Treat this as a hard quota; ZERO
motivation is allowed.

  ~65-75%  HARD FACTS from the INPUT (dates, numbers, names, places,
           records, schemes, amounts, ranks, captains, venues, winners,
           runner-ups, awards, statistics). The original transcript /
           summary / topic input is the PRIMARY source. Do not invent
           facts. If unsure, skip.

  ~15-20%  PYQs + likely MCQs. Frame at least 3-5 exam-style questions
           inside the script ("ఈ ప్రశ్న 2022 SSC లో అడిగారు...",
           "ఇది ఇలా అడగొచ్చు: ఎవరు...?" then immediately answer).
           Cover SSC, Banking, Group 1, Group 2, RRB style framings.

  ~10-15%  Memory hooks / coding tricks / mnemonics / short one-line
           analogies linking facts -- NOT long motivational stories.

  0%       Motivation / mentorship voice. STRICTLY ZERO.
           DO NOT include any "war strategy", "life balance", "6-month plan",
           "you are not alone" monologues. No emotional padding.

  ~5-8%    The 3 mandatory promos (A Telegram, B WhatsApp, C SKY app +
           360 degree strong hold).

FORBIDDEN PATTERNS (CRITICAL -- DO NOT USE):
  - ANY motivation/philosophy/emotional advice.
  - Generic "ప్రిపరేషన్ ఒక యుద్ధం", "లైఫ్ బ్యాలెన్స్", "ఆరు నెలల
    ప్రణాళిక", "మీరు ఒంటరిగా లేరు", "ధైర్యంగా ముందుకు సాగాలి"-style
    filler.
  - Repeating the same motivational point in different words.
  - Ending the script with a motivational closing.

LAST 2 SEGMENTS RULE:
  Final 2 segments = FACT-DENSE recap + rapid-fire PYQ/MCQ framing on
  the topic. Only the LAST 30-40 seconds may carry a short sign-off +
  one promo CTA. ZERO motivational closing.
`;

const REPLICA_RULES = `
================================================================
ANCHOR REPLICA RULE -- EXACT VOICE CLONE
================================================================
You are NOT writing a polished AI script. You are a VOICE CLONE of the
SKY anchor in the 4 reference transcripts. Strict requirements:

  - Use ONLY words, phrases, fillers and sentence shapes that actually
    appear in the 4 reference transcripts. If a word feels bookish,
    literary or "AI-translated" -- replace it with how the anchor
    actually says it in the references.
  - BAN bookish / formal Telugu: "నిరంతరం", "జవాబుదారీతనం",
    "పర్యవేక్షణ", "సాకారం", "పునాది", "అధిగమించాలి", "సవాల్",
    "వ్యూహాలు", "ఆయుధాలు", "శత్రువులు", "మార్గదర్శకత్వం",
    "క్రమశిక్షణ" -- UNLESS the same word appears verbatim in the
    reference transcripts.
  - Prefer the anchor's actual fillers: "సో", "అయితే", "మరి",
    "చూడండి", "అంటే ఏంటంటే", "ఓకే వచ్చేద్దాం", "ఇప్పుడు చూడండి",
    "ఒకసారి చూసుకుందాము", "గుర్తుపెట్టుకోండి", "నోట్ చేసుకోండి".
  - Code-mix English exam words inside Telugu sentences exactly like the
    anchor (SSC, Banking, Group one, mains, prelims, current affairs,
    revision, mock test, PYQ, MCQ).
  - Sentence rhythm: short bursts separated by "--". Avoid long literary
    sentences. If a sentence sounds like a textbook, rewrite it.
  - Self-check before output: re-read every segment and ask "would the
    SKY anchor in the reference transcripts actually say this exact
    sentence?" -- if no, rewrite it.
`;

export const DNA_GENERAL = `
VIDEO TYPE: GENERAL -- STRATEGY / GUIDANCE / MOTIVATION

SKY DNA RULES (content only -- no tone):
1. Hook (Seg 1): Open with a concrete fact / number / event from the
   INPUT -- NOT a generic motivational line.
2. The 'Why': One short line on exam relevance (SSC / Banking / Group 1
   / Group 2). Not a paragraph.
3. Body: Pack facts, names, dates, numbers, records FROM THE INPUT.
   Frame PYQs / MCQs around each major fact.
4. Memory Hints: Max 2-3 short coding tricks / mnemonics. No long
   analogies.
5. Community: ONE short line max -- handled inside the promos.
6. Final Segments: Fact-dense recap + rapid-fire MCQ framing. NO long
   motivational closing.

${CONTENT_MIX_BLOCK}

${REPLICA_RULES}

${PROMOTIONS_BLOCK}
`;

export const DNA_SUBJECTIVE = `
VIDEO TYPE: SUBJECTIVE -- DEEP SUBJECT TEACHING

SKY DNA RULES (content only -- no tone):
1. Logic First: Explain the concept in the anchor's own simple words,
   then layer complexity.
2. The "Link": Connect to related concepts / previous topics.
3. PYQ Alert: For EVERY major sub-topic, state if/when it was asked
   (year + exam) and frame the likely MCQ.
4. Memory Key: ONE short mnemonic / coding image per major concept.
   Not a story.
5. Final Seg: Fact + PYQ recap. Short sign-off. No motivational
   monologue.

${CONTENT_MIX_BLOCK}

${REPLICA_RULES}

${PROMOTIONS_BLOCK}
`;


const PRIORITY_NOTE = `
THREE-LAYER RULE (DO NOT VIOLATE):
  1. WHAT to speak  -> ONLY from USER INPUT (topic, chapter/idea
     context, source material, special instructions). This is the
     idea-engine output.
  2. HOW to speak   -> ONLY from the 4 STYLE REFERENCE transcripts
     (tone, code-mix, fillers, pauses, teacher rhythm).
  3. WHERE to place which point -> ONLY from SKY DNA (structure,
     promo placement, PYQ/MCQ slots, motivation share, CTAs).

HARD CONTENT BOUNDARY (most common failure):
- The 4 transcripts are VOICE SAMPLES, NOT a content source.
- NEVER lift a topic, fact, example, name, year, exam,
  department or domain word (e.g. "railway", "RRB", "IPL",
  "auction") from a transcript unless that exact thing also
  appears in USER INPUT.
- If user input is about SSC / Banking, the script is about
  SSC / Banking only. Zero spillover from transcript topics.
- Do not invent stats, dates, vacancies, results, winners,
  prize money or scores. If the user input does not provide a
  number, do not write one.

TIME / RECENCY RULE:
- Treat any event dated before today as already completed
  (past tense). Never describe a completed event as upcoming.
  If unsure about timing, speak generally without a year.

MANDATORY READING ORDER before you write a single character:
  Step 1: Read all 4 STYLE REFERENCE transcripts -- for VOICE ONLY.
  Step 2: Read the SKY DNA block -- for STRUCTURE / placement.
  Step 3: Read the USER INPUT -- this is the ONLY allowed
          content source.
  Step 4: Then -- and only then -- start generating.
`;


function buildSystem(
  taskLine: string,
  videoType: "GENERAL" | "SUBJECTIVE",
  overrides?: TrainingOverrides,
) {
  const dnaDefault = videoType === "SUBJECTIVE" ? DNA_SUBJECTIVE : DNA_GENERAL;
  const dna =
    (videoType === "SUBJECTIVE" ? overrides?.dna_subjective : overrides?.dna_general) ||
    dnaDefault;
  return `
You are an expert Telugu video script writer for sky academy.
${taskLine}

${PRIORITY_NOTE}

${dna}

${TELUGU_TTS_MASTER_PROMPT}

CRITICAL RULES:
1. telugu_text must contain ZERO emoji characters.
2. ALL numbers in telugu_text must be written as English words.
3. ALL Telugu words must be in Telugu Unicode script. NEVER Roman transliteration.
4. Each segment MUST be 150-180 words.
5. Output must be a complete, valid JSON array.

${buildStyleReferenceInstructions(overrides)}

${OUTPUT_FORMAT}
`.trim();
}

export function systemPromptFor(
  mode: "topic" | "transcript" | "pdf",
  videoType: "GENERAL" | "SUBJECTIVE",
  overrides?: TrainingOverrides,
) {
  if (mode === "transcript") {
    return buildSystem(
      "Your task is to REWRITE the provided video transcript into a sky academy voiceover script. Keep technical facts and core information; change the delivery to match sky academy.",
      videoType,
      overrides,
    );
  }
  if (mode === "pdf") {
    return buildSystem(
      "Your task is to CREATE a sky academy video script based on the provided text from a book or PDF section. Translate and adapt the educational content into a clear, teaching-focused voiceover.",
      videoType,
      overrides,
    );
  }
  return buildSystem(
    "Write a COMPLETE, ORIGINAL sky academy voiceover script on the given topic.",
    videoType,
    overrides,
  );
}

