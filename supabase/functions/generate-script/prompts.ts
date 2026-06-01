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

function buildStyleReferenceInstructions(overrides?: TrainingOverrides) {
  return `
================================================================
STYLE REFERENCE -- HIGHEST PRIORITY (HOW to speak)
================================================================
Below are FOUR real SKY Academy video transcripts (full text, no truncation).
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

export const DNA_GENERAL = `
VIDEO TYPE: GENERAL -- STRATEGY / GUIDANCE / MOTIVATION

SKY DNA RULES (content only -- no tone):
1. Hook (Seg 1): Open with a relatable problem or burning ambition.
2. The 'Why': Explain why this strategy matters for Group 1 / Group 2 exams.
3. Memory Hints: Use max 3-4 strategy memory hints (analogies like
   "War Strategy", "Life Balance"). Content hooks, not tone.
4. Community: Reinforce that SKY Academy students are a family.
5. CTA: Must mention the Telegram group for daily motivation.
6. Promotions: SKY Academy app + Telegram are the standard CTAs.
`;

export const DNA_SUBJECTIVE = `
VIDEO TYPE: SUBJECTIVE -- DEEP SUBJECT TEACHING

SKY DNA RULES (content only -- no tone):
1. Logic First: Explain the concept simply before adding complexity.
2. The "Link": Connect current topic to previous topics for a holistic view.
3. PYQ Alert: Explicitly mention if this concept was asked in 2022 or 2023 exams.
4. Memory Key: At least ONE memory hint per major concept
   (mnemonics, funny stories, coding images). Content device, not tone.
5. Final Seg: Summarize, then SKY Academy app CTA + Telegram study-notes CTA.
`;

const PRIORITY_NOTE = `
PRIORITY (do not violate):
  1. STYLE REFERENCE transcripts decide HOW to speak
     (language, words, fillers, pauses, toning).
  2. SKY DNA decides WHAT to speak
     (promotions, PYQ analysis, memory hints, CTAs, structure).
If the two ever conflict on style, the STYLE REFERENCE wins.

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
You are an expert Telugu video script writer for SKY Academy.
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
      "Your task is to REWRITE the provided video transcript into a SKY Academy voiceover script. Keep technical facts and core information; change the delivery to match SKY Academy.",
      videoType,
      overrides,
    );
  }
  if (mode === "pdf") {
    return buildSystem(
      "Your task is to CREATE a SKY Academy video script based on the provided text from a book or PDF section. Translate and adapt the educational content into a clear, teaching-focused voiceover.",
      videoType,
      overrides,
    );
  }
  return buildSystem(
    "Write a COMPLETE, ORIGINAL SKY Academy voiceover script on the given topic.",
    videoType,
    overrides,
  );
}

