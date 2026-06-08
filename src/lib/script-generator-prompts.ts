import { SKY_STYLE_TRANSCRIPTS } from "./training-transcripts";

/**
 * Script generation prompt building blocks.
 * Three pillars only:
 *   HOW to speak   -> 3 STYLE REFERENCE transcripts (style only, not facts)
 *   WHAT to speak  -> USER INPUT (topic / idea / PDF / transcript)
 *   WHERE to place -> SKY DNA (structure + promo placement)
 */

const STYLE_REFERENCE_BLOCK = SKY_STYLE_TRANSCRIPTS.map(
  (t, i) =>
    `--- REFERENCE TRANSCRIPT ${i + 1}: ${t.name} ---\n${t.text}\n--- END REFERENCE ${i + 1} ---`,
).join("\n\n");

export const STYLE_REFERENCE_INSTRUCTIONS = `
================================================================
STYLE REFERENCE -- HOW to speak (style only, NOT a content source)
================================================================
The three transcripts below are Sky's voice samples. Mimic the rhythm,
code-mix, and teacher tone. Do NOT copy their topics, facts, examples,
names, numbers or domain words into the new script.

${STYLE_REFERENCE_BLOCK}
================================================================
END STYLE REFERENCE
================================================================
`;

export const TELUGU_TTS_MASTER_PROMPT = `
================================================================
Telugu Voice Output -- Output Rules
================================================================
- All Telugu content MUST use Telugu Unicode script. No Roman transliteration.
- Use "--" (double dash) for natural pauses.
- ZERO emojis. ZERO markdown.
- Every number (years, marks, amounts, percentages, fractions, decimals,
  ordinals, Telugu numerals, Telugu number words) MUST be written as
  ENGLISH WORDS inside the Telugu sentence. Examples:
  2024 -> "twenty twenty four"; 13000 -> "thirteen thousand";
  1/2 -> "one by two"; 50% -> "fifty percent"; 1st -> "first".
- Voice tone, pacing, filler words, sentence rhythm are decided ONLY by the
  STYLE REFERENCE transcripts. Do not impose any other style rule.
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
- ALL numbers as English words
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
  a useful tip or resource.

PROMO B -- WHATSAPP MENTORSHIP (doubts + motivation + demo):
  Tell students they can text on WhatsApp for all their doubts,
  clarifications, motivation, and to book a free mentorship demo --
  "WhatsApp number description lo unnadi" style.

PROMO C -- sky academy APP + 360 DEGREE STRONG HOLD PREPARATION:
  Naturally mention the sky academy app offerings:
    - Full video courses for all competitive exams
    - PDFs
    - Quizzes
    - Section-wise tests
    - Full-length mocks
  THEN explain the PRIVATE TELEGRAM MENTORSHIP SYSTEM in the same breath:
    - Each student is added into a private group
    - Only the mentor, the tutor and the students are inside
    - Personal monitoring of every single student
    - Daily morning schedules
    - Daily evening tests
    - Topic-wise analysis
    - Continuous guidance and real accountability
  Describe this whole package as "360 degree strong hold preparation".

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
