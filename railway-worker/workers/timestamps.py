"""
workers/timestamps.py — OpenAI Whisper word-level timestamps.

Strategy for Indian-language audio (Telugu / Hindi / etc.):
  - Let Whisper auto-detect the spoken language (do NOT force language="en";
    forcing English produces hallucinated Devanagari output for Telugu audio).
  - After transcription, transliterate each word to Latin script using
    Unidecode so downstream AI prompts get a stable romanized form.
    This is transliteration (script conversion), NOT translation —
    meaning is preserved, only the script changes.

Returns a list of:
  { "word": str, "start": float, "end": float }
"""

from openai import OpenAI
from unidecode import unidecode

from lib.config import config

_openai = OpenAI(api_key=config.OPENAI_API_KEY)


def _to_latin(text: str) -> str:
    """Transliterate any script to Latin (ASCII). Keeps ASCII as-is."""
    if not text:
        return ""
    # Fast path: already ASCII
    try:
        text.encode("ascii")
        return text
    except UnicodeEncodeError:
        pass
    return unidecode(text).strip()


def get_timestamps(audio_path: str) -> tuple[list[dict], float]:
    """
    Transcribe an MP3 with Whisper and return word-level timestamps,
    with each word transliterated to Latin script.
    """
    print(f"[TS] transcribing {audio_path} (auto-detect language, transliterate to Latin)")

    with open(audio_path, "rb") as f:
        transcription = _openai.audio.transcriptions.create(
            file=f,
            model="whisper-1",
            response_format="verbose_json",
            timestamp_granularities=["word"],
            # No language= → Whisper auto-detects (Telugu / Hindi / English).
            # We transliterate the output below so AI sees Latin script.
        )

    raw_words    = getattr(transcription, "words",    None) or []
    raw_segments = getattr(transcription, "segments", None) or []

    words: list[dict] = []
    for w in raw_words:
        original = (w.word if hasattr(w, "word") else w.get("word", "")).strip()
        if not original:
            continue
        latin = _to_latin(original)
        if not latin:
            continue
        words.append({
            "word":     latin,
            "original": original,
            "start":    round(float(w.start if hasattr(w, "start") else w.get("start", 0)), 3),
            "end":      round(float(w.end   if hasattr(w, "end")   else w.get("end",   0)), 3),
        })

    if raw_segments:
        last = raw_segments[-1]
        duration = float(last.end if hasattr(last, "end") else last.get("end", 0))
    elif words:
        duration = words[-1]["end"]
    else:
        duration = 0.0

    detected = getattr(transcription, "language", None)
    print(f"[TS] detected={detected!r}, {len(words)} words, duration={duration:.2f}s")
    return words, duration
