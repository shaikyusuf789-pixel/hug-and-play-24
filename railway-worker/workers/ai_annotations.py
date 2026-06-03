import json
import os
from typing import Any
from openai import OpenAI
from lib.config import config

client = OpenAI(api_key=config.OPENAI_API_KEY)

def run_ai_annotations(script_text: str, ocr_words: list[dict], ts_words: list[dict]) -> list[dict]:
    """
    Two-stage AI Annotation process.
    Stage 1: GPT-4o decides what to annotate and where (using OCR boxes).
    Stage 2: GPT-4o-mini syncs the start_times with exact word timestamps.
    """

    # --- STAGE 1: GPT-4o (Decision & BBoxes) ---
    stage1_prompt = f"""
You are an AI director for an educational video. Your goal is to choose which words or phrases on the slide should be annotated (circled or underlined) to emphasize what the narrator is saying.

INPUTS:
1. SCRIPT TEXT: "{script_text}"
2. OCR DATA (Words found on slide with coordinates): {json.dumps(ocr_words[:100])} ...
3. ROUGH TIMESTAMPS: {json.dumps([{"t": w["text"], "s": w["start"]} for w in ts_words[:50]])} ...

TASK:
- Choose exactly 10 to 15 annotations in total for this chunk.
- Balance: Aim for 5 to 7 'circle' annotations; the remaining should be 'underline'.
- Identify key concepts, keywords, or short phrases being spoken that are visible on the slide.
- Choose annotation type: 'circle' (for single words or short terms) or 'underline' (for key phrases).
- USE OCR DATA: Provide the exact bounding box (x, y, w, h) for the target text.

RULES:
- ONLY 'circle' and 'underline' types are allowed.
- AVOID LONG UNDERLINES: Never underline a full line or a full slide. Keep underlines clean and focused on specific keywords/phrases (1-4 words).
- Make it feel like a human tutor: Annotate things as they are mentioned.
- Return a JSON object with a key "annotations" which is a list of:
  {{ "type": "circle"|"underline", "target_text": "text", "bbox": {{"x":0, "y":0, "w":0, "h":0}}, "start_time": 0.0 }}
"""

    print("[AI] Stage 1: Running GPT-4o...")
    response1 = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "system", "content": "You are a precise AI director. Return only JSON."},
                  {"role": "user", "content": stage1_prompt}],
        response_format={"type": "json_object"}
    )
    
    stage1_data = json.loads(response1.choices[0].message.content or "{}")
    proposed_annotations = stage1_data.get("annotations", [])
    print(f"[AI] Stage 1 finished. Proposed {len(proposed_annotations)} annotations.")

    if not proposed_annotations:
        return []

    # --- STAGE 2: GPT-4o-mini (Timestamp Sync) ---
    stage2_prompt = f"""
You are a precise audio-visual sync specialist. You need to correct the start_times of proposed annotations to match the exact moment the narrator speaks those words.

INPUTS:
1. PROPOSED ANNOTATIONS: {json.dumps(proposed_annotations)}
2. EXACT WORD TIMESTAMPS (from narrator): {json.dumps([{"w": w["text"], "s": w["start"]} for w in ts_words])}

TASK:
- For each proposed annotation, find the "target_text" in the "EXACT WORD TIMESTAMPS" list.
- If the target_text is a phrase, use the "start" time of the FIRST word in that phrase.
- Update the "start_time" field with the exact "s" value from the timestamps.
- Return the exact same list of annotations but with corrected "start_time" values.

RULES:
- Return a JSON object with a key "annotations".
- DO NOT change the 'type', 'target_text', or 'bbox'. ONLY correct 'start_time'.
"""

    print("[AI] Stage 2: Running GPT-4o-mini for sync...")
    response2 = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "system", "content": "You are a sync specialist. Return only JSON."},
                  {"role": "user", "content": stage2_prompt}],
        response_format={"type": "json_object"}
    )

    stage2_data = json.loads(response2.choices[0].message.content or "{}")
    final_annotations = stage2_data.get("annotations", [])
    print(f"[AI] Stage 2 finished. Synced {len(final_annotations)} annotations.")

    return final_annotations
