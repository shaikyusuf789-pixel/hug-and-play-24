
# Plan: Pure GPT-4o annotation pipeline (no Python logic)

## Goal
Match the **old Replit 5-stage system** but remove all Python "thinking" from annotation generation. Python only orchestrates HTTP/DB calls — every decision (what to annotate, where the bbox is, when to fire) is made by GPT-4o.

## What exists today (the part we're replacing)

`railway-worker/workers/ai_annotations.py` does a LOT of Python work after GPT-4o returns:
- Recomputes every `bbox` from OCR (overrides GPT)
- Recomputes every `start_time` by string-matching `script_phrase` against ElevenLabs word timestamps
- Demotes oversized circles → underlines
- Deduplicates by bbox
- Clamps into speech window, single-pass de-cluster

UI entry points (won't change):
- `POST {RAILWAY}/ai/run` (single chunk)
- `POST {RAILWAY}/ai/run-all` (all chunks)
Both called from `src/routes/_dashboard.annotations.tsx`.

Database sink (won't change): `clip_annotations.annotations` (JSON array of `{type,start_time,target_text,bbox}`).

## New pipeline (mirrors Replit Stages 3 + 4 + 5, all GPT)

### Stage A — Generator call (GPT-4o vision, single call)
Inputs sent in one prompt:
- Slide image URL (vision)
- Full OCR dump: `[idx] "word" bbox=[x,y,w,h]`
- Word-level timestamps: `[idx] start=Xs "word"`
- Transliterated script + original script
- Speech window (`first_word.start`, `last_word.end`, total duration)
- Hard rules baked into prompt: 12–20 annotations, chronological, ≥4s apart, no annotation before `speech_start`, heading gets first annotation at `speech_start + 0.3s`

Ask GPT to return the **final** JSON:
```json
{"annotations":[
  {"type":"circle","start_time":6.42,"target_text":"SSC CGL 2026","bbox":[262,343,640,81]},
  ...
]}
```
i.e. GPT picks bbox (by reading OCR list it was given) and start_time (by reading timestamp list it was given). No Python correction.

### Stage B — Timestamp sync call (GPT-4o, second call)
Mirrors Replit's Stage 5. Send GPT:
- The annotations list from Stage A (target_text + provisional start_time)
- The full word-timestamp list with indices

Ask: "For each annotation, return the timestamp index where the narrator says this concept." GPT returns `[12, 27, 41, ...]`.

Compute `start_time = max(speech_start, ts_words[idx].start − lead)` where `lead = 0.8 × draw_duration(type)`, clamped 0.5–2.0s. (This is the only arithmetic — it's not "logic", it's literally what the Replit reference specifies.)

### Stage C — Persist
Write to `clip_annotations` exactly as today. No type demotion, no dedup, no declustering — if GPT misbehaves we fix the prompt, not Python.

## Files to change

| File | Change |
|---|---|
| `railway-worker/workers/ai_annotations.py` | Strip every helper (`_locate_phrase_bbox`, `_locate_phrase_start_time`, dedup, declustering, circle-demotion). Keep only: build prompt → call GPT-4o → optional second GPT-4o sync call → return JSON verbatim. ~600 lines → ~150 lines. |
| `railway-worker/main.py` | No change — same endpoints, same payload. |
| UI | No change. |
| DB schema | No change. |

## Open decisions (need your call before I build)

1. **One call or two?** Replit used two (generator + sync). One call is simpler and cheaper but timing accuracy may regress vs current Python lookup. Recommendation: **two calls** (Stage A + Stage B), still 100% GPT-4o.
2. **Safety nets**: Drop ALL of them (true to "no Python")? Or keep the bare minimum — clamp `start_time` into `[speech_start, speech_end]`? Recommendation: **keep only the clamp**; everything else is GPT's job.
3. **Heading rule**: Hard-code "first annotation = heading at speech_start+0.3s" in Python, or just instruct GPT? Recommendation: **instruct GPT only**.

## Risks I want you to see before approving

- GPT-4o bbox accuracy from text-listed OCR is decent but not perfect — expect a few annotations landing 5–20px off the target word. Today's Python lookup makes this exact. Removing it = visibly looser placement.
- GPT-4o timing without Python grounding has historically drifted 10–20s (your current comments in code say so). Stage B sync call mitigates but does not eliminate this.
- Cost/latency: 2 GPT-4o vision calls per chunk × N chunks. Bulk "run-all" will get noticeably slower and ~2× the OpenAI bill.

## What I will NOT touch
- OCR (Google Vision) — stays
- ElevenLabs timestamps — stay
- Render worker — stays
- UI annotations page — stays

---
Tell me: (a) one-call or two-call, (b) keep the speech-window clamp or strip everything, (c) approve and I'll build.
