// Deno-side script-generation prompts.
// Three pillars only:
//   HOW to speak   -> 3 STYLE REFERENCE transcripts (style only, not facts)
//   WHAT to speak  -> USER INPUT (topic / idea / PDF / transcript)
//   WHERE to place -> SKY DNA (structure + promo placement)

import { SKY_STYLE_TRANSCRIPTS } from "./transcripts.ts";

export type TrainingOverrides = {
  transcripts?: (string | null | undefined)[];
  dna_general?: string | null;
  dna_subjective?: string | null;
};

export const TELUGU_TTS_MASTER_PROMPT = `
================================================================
Telugu Voice Output -- Output Rules (STRICT, NON-NEGOTIABLE)
================================================================
- All Telugu content MUST use Telugu Unicode script. No Roman transliteration of Telugu words.
- PUNCTUATION (MANDATORY -- use the FULL set, do NOT default to one mark):
    Use commas (,), periods (.), question marks (?), exclamations (!),
    ellipses (...), semicolons (;), colons (:), single dashes (-),
    parentheses ( ), and quotes (" "). Mix them naturally.
  FORBIDDEN punctuation: double dashes (--), em-dashes (—), and the
    asterisk (*). NEVER output "--" anywhere in the script.
  Pause length guide for the TTS engine:
    comma = short pause, ellipsis (...) = medium thinking pause,
    semicolon/colon = medium pause, period = full stop,
    ? and ! = expressive stop. Place them at every natural breath
    point (every 4-7 words) so the narration does NOT feel flat,
    slow, or dragging.
- STRESS / EMPHASIS (MANDATORY): The default TTS read is too calm and
  too slow. Force energy by:
    * CAPITALISING the 1-2 KEY English words in each sentence
      (e.g. EXAM, IMPORTANT, MUST, NEVER, FIRST, BIGGEST) so the
      engine stresses them.
    * For Telugu, stretch stressed vowels by doubling the vowel
      sign on the most important word (e.g. చాలాా, ఇదేే, కచ్చితంగాా)
      so the consonant + vowel gets a clear emphasis.
    * Use ! on punchy lines and ? on rhetorical questions to lift
      the pitch and break monotone delivery.
- ZERO emojis. ZERO markdown. ZERO asterisks.
- Every number (years, marks, amounts, percentages, fractions, decimals, ordinals,
  Telugu numerals, Telugu number words) MUST be written as ENGLISH WORDS inside the
  Telugu sentence. Examples: 2024 -> "twenty twenty four"; 13000 -> "thirteen thousand";
  1/2 -> "one by two"; 50% -> "fifty percent"; 1st -> "first"; Rs.500 -> "rupees five hundred".
- Voice tone, pacing, filler words, sentence rhythm follow the STYLE
  REFERENCE transcripts, but the punctuation + stress rules above
  OVERRIDE any flat / slow reading.
`;

const PROMOTIONS_BLOCK = `
MANDATORY PROMOTIONS (insert each ONE TIME, ONCE EACH, at the most natural
and apt place inside the script -- never two in a row, never at the very
opening, never crammed at the end. They MUST feel like the mentor is
casually telling students, NOT like an advertisement.):

PROMO A -- TELEGRAM CHANNEL (free resources + updates):
  Tell students to join the free Telegram channel for free study materials,
  quick updates, important alerts and many more useful resources -- "link
  description lo undi" style. Place this right after you finished giving
  a useful tip or resource, so it feels like a natural extension.

PROMO B -- WHATSAPP MENTORSHIP (doubts + motivation + demo):
  Tell students they can text on WhatsApp for all their doubts,
  clarifications, motivation, and to book a free mentorship demo --
  "WhatsApp number description lo unnadi" style. Place this where students
  would emotionally need support.

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
  discipline, or "how to actually crack the exam".

RULES for all 3 promos:
  - Each promo appears EXACTLY ONCE. No repetition.
  - Spread them out -- never back-to-back.
  - Tone = mentor-to-student, never advertisement-style.
  - Do NOT add any new promo, link or product beyond A, B and C above.
`;

export const DNA_GENERAL = `
VIDEO TYPE: GENERAL -- STRATEGY / GUIDANCE

DNA (structure / WHERE to place what):
1. Hook: Open with a concrete fact / number / event from the INPUT.
2. The 'Why': One short line on exam relevance (SSC / Banking / Group 1 / Group 2).
3. Body: Facts, names, dates, numbers, records FROM THE INPUT.
4. Recap + sign-off.

${PROMOTIONS_BLOCK}
`;

export const DNA_SUBJECTIVE = `
VIDEO TYPE: SUBJECTIVE -- DEEP SUBJECT TEACHING

DNA (structure / WHERE to place what):
1. Logic First: Explain the concept clearly, then layer complexity.
2. The "Link": Connect to related concepts / previous topics.
3. PYQ Alert: For each major sub-topic, mention if/when it was asked
   (year + exam) and frame the likely MCQ.
4. Recap + sign-off.

${PROMOTIONS_BLOCK}
`;
