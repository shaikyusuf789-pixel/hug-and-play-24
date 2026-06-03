"""
workers/ai_annotations.py — GPT-4o (vision) generates rich annotation events.

Each annotation:
  {
    "type":        "underline" | "double_underline" | "circle" | "box" | "arrow",
    "start_time":  float   (seconds, semantically aligned to spoken concept),
    "target_text": str     (EXACT OCR text — used to locate bbox at render time),
    "bbox":        [x, y, w, h]  (OCR pixel coordinates),
  }

Key idea: the slide is PARAPHRASED from the script (not literal). The model
must do semantic matching — for each meaningful concept in the spoken script,
find the closest matching word / phrase / line on the slide and annotate it.
"""

import json
import re
from difflib import SequenceMatcher
from typing import Any

from openai import OpenAI
from lib.config import config

_openai = OpenAI(api_key=config.OPENAI_API_KEY)

_SYSTEM_PROMPT = """You are an expert video annotation director. Your job is to generate visual annotations that perfectly align with spoken words and slide content.

GROUNDING PROCESS:
For each annotation you create, you MUST follow this internal logic:
1. SCRIPT MATCH: Find a key concept being spoken in the script.
2. TIMING: Look up the exact 'start_time' for that concept in the "WORD-LEVEL TIMESTAMPS".
3. VISUAL MATCH: Find the EXACT matching text on the slide in the "OCR DUMP".
4. COORDINATES: Use the 'bbox' coordinates [x, y, w, h] provided for those words in the OCR DUMP. Do NOT guess or hallucinate coordinates.

STRICT RULES:
- start_time: Must be the exact 'start' value from the timestamps.
- target_text: Must be the verbatim text from the OCR dump.
- bbox: Must be the [x, y, w, h] from the OCR dump. If you highlight multiple words, the bbox should be the union (min_x, min_y, max_width, max_height) of their individual bboxes.
- CHRONOLOGY: Annotations MUST be sorted by start_time.
- DISTRIBUTION: Spread annotations naturally across the entire speech window. Do not cluster them at the end.

ANNOTATION TYPES:
- circle: Use for single keywords or short 1-3 word phrases. (High priority)
- underline: Use for phrases (2-5 words).
- box: Use to frame formulas, statistics, or distinct callout boxes.
- arrow: Use to point AT a specific word, number, or bullet point.

OUTPUT FORMAT:
Return ONLY a JSON object:
{
  "annotations": [
    {
      "type": "circle",
      "start_time": 1.25,
      "target_text": "Keyword",
      "bbox": [100, 200, 50, 30]
    }
  ]
}"""

def generate_annotations(
    ocr_words: list[dict],
    ts_words: list[dict],
    chunk_text: str,
    chunk_number: int,
    slide_image_url: str | None = None,
    slide_prompt: str | None = None,
    original_script: str | None = None,
) -> list[dict[str, Any]]:
    """
    Call GPT-4o (vision) to generate rich, semantically-aligned annotations.
    """
    print(f"[AI] generating annotations for chunk {chunk_number} "
          f"(ocr_words={len(ocr_words)}, ts_words={len(ts_words)}, "
          f"slide_image={'yes' if slide_image_url else 'no'})")

    total_dur = ts_words[-1].get("end", 10.0) if ts_words else 10.0
    speech_start = float(ts_words[0].get("start", 0.0)) if ts_words else 0.0
    speech_end   = float(ts_words[-1].get("end",   total_dur)) if ts_words else float(total_dur)
    speech_window = max(0.1, speech_end - speech_start)

    user_text = f"""CHUNK {chunk_number}  —  audio duration: {float(total_dur):.2f}s

=== SPEECH WINDOW (CRITICAL) ===
First spoken word starts at: {speech_start:.2f}s
Last spoken word ends at:    {speech_end:.2f}s
Total speech window:         {speech_window:.2f}s
The audio has ~{speech_start:.1f}s of intro/silence before the narrator begins.
HARD RULES:
  • NEVER place an annotation with start_time < {speech_start:.2f}s.
  • All annotations MUST fall within [{speech_start:.2f}s, {speech_end:.2f}s].
  • Space annotations at LEAST 4–5 seconds apart across the speech window.
  • Match each start_time to when that specific word is actually spoken,
    using the WORD-LEVEL TIMESTAMPS below as ground truth.

=== GAMMA SLIDE PROMPT (original creative intent) ===
{slide_prompt or "(not available)"}

=== ORIGINAL SCRIPT (native language) ===
{original_script or chunk_text or "(not available)"}

=== TRANSLITERATED SCRIPT (matches timestamps) ===
{chunk_text or "(not available)"}

=== WORD-LEVEL TIMESTAMPS (Latin) ===
{_ts_lines(ts_words)}

=== FULL OCR DUMP (every word on the slide with bbox) ===
{_ocr_lines(ocr_words)}

=== TASK ===
1. Analyze the slide image.
2. Read the script and timestamps.
3. For each concept mentioned, find the matching text in the "OCR DUMP".
4. Extract the 'start' timestamp for when that concept is spoken.
5. Extract the 'bbox' coordinates from the OCR dump.
6. Generate 12-25 annotations.

PRECISION IS KEY: If you choose "circle" for "Physics", you MUST find "Physics" in the OCR dump and use its bbox. Do not estimate coordinates.

Return ONLY the JSON object. Do not explain your reasoning. Just the data. """

    user_content: list[dict[str, Any]] = [{"type": "text", "text": user_text}]
    if slide_image_url:
        user_content.append({
            "type": "image_url",
            "image_url": {"url": slide_image_url, "detail": "auto"},
        })

    import time as _time
    last_err: Exception | None = None
    response = None
    for attempt in range(6):
        try:
            response = _openai.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user",   "content": user_content},
                ],
                response_format={"type": "json_object"},
                max_tokens=4000,
                temperature=0.3,
            )
            break
        except Exception as e:
            last_err = e
            msg = str(e)
            is_429 = "429" in msg or "rate_limit" in msg.lower() or "rate limit" in msg.lower()
            if not is_429 or attempt == 5:
                raise
            wait_s = 12.0
            m = re.search(r"try again in ([\d.]+)s", msg)
            if m:
                try: wait_s = float(m.group(1)) + 2.0
                except Exception: pass
            wait_s = min(60.0, max(wait_s, 5.0 * (attempt + 1)))
            print(f"[AI] 429 rate-limited (attempt {attempt+1}/6) — sleeping {wait_s:.1f}s")
            _time.sleep(wait_s)
    if response is None:
        raise last_err or RuntimeError("OpenAI call failed")

    raw = response.choices[0].message.content or "{}"
    try:
        parsed = json.loads(raw)
    except Exception:
        m = re.search(r"\{[\s\S]*\}", raw)
        parsed = json.loads(m.group(0)) if m else {}

    annotations = parsed.get("annotations", [])
    if not isinstance(annotations, list):
        annotations = []

    # Replit-style: Trust the LLM's grounding but apply minimal sanity checks.
    allowed_types = {"underline", "circle", "box", "arrow"}
    clean: list[dict[str, Any]] = []

    for ann in annotations:
        t = ann.get("type")
        if t == "double_underline": t = "underline"
        if t not in allowed_types: continue
        
        target = str(ann.get("target_text") or "").strip()
        bbox = ann.get("bbox")
        start_time = ann.get("start_time")
        
        if not target or not isinstance(bbox, list) or len(bbox) != 4 or start_time is None:
            continue

        # In Replit-style, we trust the LLM for coordinates and timing,
        # only ensuring the values are within reasonable bounds.
        clean.append({
            "type":        t,
            "start_time":  max(0.0, float(start_time)),
            "target_text": target,
            "bbox":        [int(v) for v in bbox],
        })

    # Safety net: demote oversized "circle" annotations to a short "underline".
    # GPT sometimes circles entire bullets / multi-line blocks, which looks like
    # a lasso around a paragraph. If the bbox is tall (multi-line) or the target
    # text has too many words/chars, switch to underline so it reads as a
    # highlight under the phrase instead of a giant loop.
    if ocr_words:
        avg_h = sum(int(w.get("h", 0)) for w in ocr_words) / max(len(ocr_words), 1)
    else:
        avg_h = 0
    for ann in clean:
        if ann["type"] != "circle":
            continue
        words = ann["target_text"].split()
        bbox_h = ann["bbox"][3] if len(ann["bbox"]) == 4 else 0
        too_tall = avg_h > 0 and bbox_h > avg_h * 1.8
        too_wordy = len(words) > 4 or len(ann["target_text"]) > 30
        if too_tall or too_wordy:
            ann["type"] = "underline"

    # Drop duplicate bboxes (GPT often collapses several phrases onto the same
    # heading bbox — keep only the first occurrence per bbox).
    seen: set[tuple[int, int, int, int]] = set()
    deduped: list[dict[str, Any]] = []
    for ann in clean:
        key = tuple(ann["bbox"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(ann)
    clean = deduped

    clean.sort(key=lambda a: a["start_time"])

    # Safety net: clamp into speech window + de-cluster ONLY exact overlaps.
    # The old +4s cascade was destroying timing on dense slides — a single
    # tight cluster early on shoved every later annotation 4s, 8s, 12s late,
    # which is why "B12" was firing 20s+ after the narrator said it.
    # Now: trust GPT's timestamps (they came from real word timestamps), only
    # nudge true overlaps by 0.4s and DO NOT propagate the nudge further.
    if clean and ts_words:
        sw_start = float(ts_words[0].get("start", 0.0))
        sw_end   = float(ts_words[-1].get("end",   total_dur))
        spaced: list[dict[str, Any]] = []
        used: list[float] = []
        for ann in clean:
            t = max(sw_start, min(sw_end, float(ann["start_time"])))
            # Soft de-cluster: if within 0.4s of an already-placed annotation,
            # nudge by 0.4s. Single-pass — never cascade.
            for u in used:
                if abs(t - u) < 0.4:
                    t = min(sw_end, u + 0.4)
                    break
            ann["start_time"] = round(t, 3)
            spaced.append(ann)
            used.append(t)
        clean = spaced
        clean.sort(key=lambda a: a["start_time"])

    print(f"[AI] {len(clean)} annotations generated for chunk {chunk_number} "
          f"(window {ts_words[0].get('start',0) if ts_words else 0:.2f}s → "
          f"{ts_words[-1].get('end',0) if ts_words else 0:.2f}s)")
    return clean

def _ts_lines(ts_words: list[dict]) -> str:
    lines = []
    for w in ts_words:
        start = w.get("start", 0)
        word = w.get("word", w.get("text", ""))
        lines.append(f"{float(start):.2f}s: {word}")
    return "\n".join(lines)

def _ocr_lines(ocr_words: list[dict]) -> str:
    lines = []
    for w in ocr_words:
        text = w.get("text", "")
        x, y, w_val, h = w.get("x", 0), w.get("y", 0), w.get("w", 0), w.get("h", 0)
        lines.append(f"bbox [{x}, {y}, {w_val}, {h}] → \"{text}\"")
    return "\n".join(lines)

# ── Phrase → bbox locator ────────────────────────────────────────────────────


_NORM_RE = re.compile(r"[^a-z0-9]+")

def _norm(s: str) -> str:
    return _NORM_RE.sub("", s.lower())


def _locate_phrase_bbox(phrase: str, ocr_words: list[dict]) -> list[int] | None:
    """
    Find the contiguous OCR word run whose joined text best matches `phrase`
    and return the union bbox [x, y, w, h]. Returns None if no decent match.
    """
    if not phrase or not ocr_words:
        return None
    target = _norm(phrase)
    if not target:
        return None

    norm_words = [_norm(w.get("text", "")) for w in ocr_words]
    n = len(ocr_words)
    best: tuple[float, int, int] | None = None

    for i in range(n):
        joined = ""
        for j in range(i, min(n, i + 40)):
            joined += norm_words[j]
            if not joined:
                continue
            if target in joined:
                overshoot = len(joined) - len(target)
                score = 1.0 - (overshoot / max(len(target), 1)) * 0.2
                if best is None or score > best[0]:
                    best = (score, i, j + 1)
                break
            if joined in target:
                cov = len(joined) / len(target)
                if cov >= 0.6:
                    score = cov * 0.9
                    if best is None or score > best[0]:
                        best = (score, i, j + 1)
            if len(joined) > len(target) * 2:
                break

    if best is None:
        return None
    _, i, j = best

    xs, ys, x2s, y2s = [], [], [], []
    for k in range(i, j):
        w = ocr_words[k]
        x = int(w.get("x", 0)); y = int(w.get("y", 0))
        ww = int(w.get("w", 0)); hh = int(w.get("h", 0))
        xs.append(x); ys.append(y); x2s.append(x + ww); y2s.append(y + hh)
    if not xs:
        return None
    return [min(xs), min(ys), max(x2s) - min(xs), max(y2s) - min(ys)]


# ── Phrase → start_time locator (deterministic, no LLM) ──────────────────────

def _locate_phrase_start_time(
    phrase: str,
    ts_words: list[dict],
    min_start: float = -1.0,
) -> float | None:
    """
    Find a consecutive run of ts_words whose joined normalized text contains
    (or is contained by) the normalized `phrase`, and return the .start of
    the first matched word. Prefers matches with start >= min_start to keep
    annotations chronologically advancing when the same phrase repeats.

    Returns None if no acceptable match exists.
    """
    if not phrase or not ts_words:
        return None
    target = _norm(phrase)
    if not target:
        return None

    # Normalize each ts_word.
    norm = []
    for w in ts_words:
        s = w.get("word") or w.get("text") or ""
        norm.append(_norm(s))
    n = len(ts_words)

    candidates: list[tuple[float, int, float]] = []  # (score, i, start)

    for i in range(n):
        joined = ""
        for j in range(i, min(n, i + 12)):  # max 12-word window
            joined += norm[j]
            if not joined:
                continue
            score = None
            if target in joined:
                overshoot = len(joined) - len(target)
                score = 1.0 - (overshoot / max(len(target), 1)) * 0.2
            elif joined in target and len(joined) / len(target) >= 0.6:
                score = (len(joined) / len(target)) * 0.85
            if score is not None:
                try:
                    start = float(ts_words[i].get("start", 0.0))
                except (TypeError, ValueError):
                    start = 0.0
                candidates.append((score, i, start))
                if target in joined:
                    break
            if len(joined) > len(target) * 2.5:
                break

    if not candidates:
        return None

    # Prefer the earliest match whose start >= min_start (chronological).
    forward = [c for c in candidates if c[2] >= min_start - 0.01]
    pool = forward if forward else candidates
    # Among the pool, take the best score; tie-break by smallest start.
    pool.sort(key=lambda c: (-c[0], c[2]))
    return pool[0][2]


def _locate_target_start_time(
    target_text: str,
    ts_words: list[dict],
    min_start: float = -1.0,
) -> float | None:
    """Map visible slide text back to spoken timestamp words.

    GPT sometimes supplies a weak `script_phrase` for a good visual target
    (for example target_text="acceleration" but script_phrase="adugutaru").
    This deterministic repair looks for the target itself, plus common
    Telugu-English phonetic spellings produced by forced alignment.
    """
    if not target_text or not ts_words:
        return None

    variants = _target_variants(target_text)
    if not variants:
        return None

    norm_words = [_norm(w.get("word") or w.get("text") or "") for w in ts_words]
    candidates: list[tuple[float, float]] = []  # (score, start)
    for i in range(len(ts_words)):
        joined = ""
        for j in range(i, min(len(ts_words), i + 8)):
            joined += norm_words[j]
            if not joined:
                continue
            for variant in variants:
                if not variant:
                    continue
                score = 0.0
                if variant in joined or joined in variant:
                    score = min(len(variant), len(joined)) / max(len(variant), len(joined), 1)
                    score = max(score, 0.88)
                else:
                    score = SequenceMatcher(None, variant, joined).ratio()
                if score >= 0.78:
                    try:
                        start = float(ts_words[i].get("start", 0.0) or 0.0)
                    except (TypeError, ValueError):
                        start = 0.0
                    if start >= min_start - 0.01:
                        candidates.append((score, start))
            if len(joined) > 80:
                break

    if not candidates:
        return None
    candidates.sort(key=lambda c: (-c[0], c[1]))
    return candidates[0][1]


def _target_variants(target_text: str) -> list[str]:
    words = re.findall(r"[A-Za-z0-9]+", target_text.lower())
    variants: set[str] = set()
    if words:
        variants.add("".join(words))
        for w in words:
            if len(w) >= 3:
                variants.add(w)

    phrase_map = {
        "skyacademy": ["skyacademy"],
        "ssccgl2026": ["ssccgl2026", "ssccgl"],
        "highyield": ["highyield", "haiyild", "yild"],
        "topics": ["topics", "tapiks", "tapik"],
        "physics": ["physics", "phijiks", "phijik", "fijiks"],
        "motion": ["motion", "mosn"],
        "force": ["force", "phors", "fors"],
        "mass": ["mass", "mas"],
        "important": ["important", "impartemt", "impartment"],
        "acceleration": ["acceleration", "yaksilresn", "aksilresn", "accilresn"],
        "fma": ["fma"],
    }
    compact = "".join(words)
    for key, vals in phrase_map.items():
        if key in compact or compact in key:
            variants.update(vals)
    for w in words:
        variants.update(phrase_map.get(w, []))

    return sorted({_norm(v) for v in variants if _norm(v)}, key=len, reverse=True)
