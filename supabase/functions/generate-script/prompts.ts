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
- TTS-READY NUMBERS RULE (HARD): Output is fed DIRECTLY into a TTS engine.
  NEVER use any digits (0-9), fractions (1/2), decimals (13.5), percentages
  (50%), currency symbols, or ordinal suffixes in telugu_text. EVERY number
  MUST be spelled out as English words inside the Telugu sentence.
  Examples: 13000 → "thirteen thousand"; 1/2 → "one by two";
  13.5 → "thirteen point five"; 50% → "fifty percent";
  2024 → "twenty twenty four"; 1st → "first".
  Self-check: scan telugu_text for any digit 0-9 or %, /, ., $, ₹ between
  digits — if found, rewrite as English words.
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

export const DNA_GENERAL = `
VIDEO TYPE: GENERAL -- STRATEGY / GUIDANCE
(NO MOTIVATION ALLOWED)

SKY DNA RULES (content only -- no tone):
1. Hook (Seg 1): Open with a concrete fact / number / event from the
   INPUT -- NOT a generic motivational line.
2. The 'Why': One short line on exam relevance (SSC / Banking / Group 1
   / Group 2). Not a paragraph.
3. Body: Pack facts, names, dates, numbers, records FROM THE INPUT.
   Frame PYQs / MCQs around each major fact.
4. Memory Hints: Max 2-3 short coding tricks / mnemonics. No long
   analogies or motivational stories.
5. Community: ONE short line max -- handled inside the promos.
6. Final Segments: Fact-dense recap + rapid-fire MCQ framing. ZERO
   motivational closing.

FORBIDDEN PATTERNS:
- STRICTLY ZERO motivation/emotional padding.
- No "war strategy", "life balance", or "you are not alone" monologues.

${PROMOTIONS_BLOCK}
`;

export const DNA_SUBJECTIVE = `
VIDEO TYPE: SUBJECTIVE -- DEEP SUBJECT TEACHING
(NO MOTIVATION ALLOWED)

SKY DNA RULES (content only -- no tone):
1. Logic First: Explain the concept in the anchor's own simple words,
   then layer complexity.
2. The "Link": Connect to related concepts / previous topics.
3. PYQ Alert: For EVERY major sub-topic, state if/when it was asked
   (year + exam) and frame the likely MCQ.
4. Memory Key: ONE short mnemonic / coding image per major concept.
   Not a story.
5. Final Seg: Fact + PYQ recap. Short sign-off. ZERO motivational
   monologue.

FORBIDDEN PATTERNS:
- STRICTLY ZERO motivation/emotional padding.
- No "war strategy", "life balance", or "you are not alone" monologues.

${PROMOTIONS_BLOCK}
`;


const PRIORITY_NOTE = `
PRIORITY (do not violate):
  1. STYLE REFERENCE transcripts decide HOW to speak
     (language, words, fillers, pauses, toning).
  2. SKY DNA decides WHAT to speak
     (promotions, PYQ analysis, memory hints, CTAs, structure).
If the two ever conflict on style, the STYLE REFERENCE wins.

BRAND SAFETY (CRITICAL):
- NO MATTER WHAT THE INPUT IS, you are STRICTLY FORBIDDEN from using:
    - Any other academy names (e.g., Adda247, etc.)
    - Any other course promotions, batch names, or batch years.
    - Any discount codes or offers NOT explicitly mentioned in the
      "Special Instructions" box of the USER INPUT.
  This script is exclusively for the sky academy YouTube channel.

MANDATORY READING ORDER before you write a single character:
  Step 1: Read every alphabet and every word of all 4 STYLE REFERENCE
          transcripts below. No skipping.
  Step 2: Read the SKY DNA block for content/format rules.
  Step 3: Then -- and only then -- start generating the script.
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

