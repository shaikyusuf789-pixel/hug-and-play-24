/**
 * timestamps.functions.ts — Forced-alignment timestamps via ElevenLabs.
 *
 * Replaces the Railway /timestamps/run endpoint. Calls ElevenLabs
 * Forced Alignment API directly (audio + known script text → true per-word
 * timings, accuracy ~50–100ms). Writes results to public.audio_timestamps.
 *
 * Railway is no longer wired for timestamps; OCR + clip render still use it.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import anyAscii from "any-ascii";

const RunInput = z.object({
  scriptId: z.string().uuid(),
  chunkId: z.string().uuid(),
  chunkNumber: z.number().int().nonnegative(),
});

const RunAllInput = z.object({
  scriptId: z.string().uuid(),
});

type WordEntry = {
  word: string;
  original: string;
  start: number;
  end: number;
};

async function alignOneChunk(
  scriptId: string,
  chunkId: string,
  chunkNumber: number,
): Promise<{ wordCount: number; duration: number }> {
  const apiKey = process.env.ELEVEN_LABS_API_KEY;
  if (!apiKey) throw new Error("ELEVEN_LABS_API_KEY is not configured");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1) Load chunk row (need content + audio_url).
  const { data: chunk, error: chunkErr } = await supabaseAdmin
    .from("script_chunks")
    .select("content,audio_url")
    .eq("id", chunkId)
    .single();
  if (chunkErr) throw new Error(`load chunk failed: ${chunkErr.message}`);
  if (!chunk) throw new Error(`chunk ${chunkId} not found`);

  const scriptText = (chunk.content || "").trim();
  const audioUrl = (chunk.audio_url || "").trim();
  if (!scriptText) throw new Error("chunk has no content");
  if (!audioUrl) throw new Error("chunk has no audio_url — generate audio first");

  // 2) Pull the audio bytes (audio-files bucket is public).
  const audioResp = await fetch(audioUrl);
  if (!audioResp.ok) {
    throw new Error(`download audio failed: HTTP ${audioResp.status}`);
  }
  const audioBlob = await audioResp.blob();

  // 3) POST to ElevenLabs forced alignment.
  const fd = new FormData();
  fd.append("file", audioBlob, "audio.mp3");
  fd.append("text", scriptText);

  const alignResp = await fetch(
    "https://api.elevenlabs.io/v1/forced-alignment",
    {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: fd,
    },
  );

  if (!alignResp.ok) {
    const errText = await alignResp.text();
    throw new Error(
      `ElevenLabs forced-alignment failed ${alignResp.status}: ${errText.slice(0, 500)}`,
    );
  }

  const payload: any = await alignResp.json();
  const rawWords: any[] = payload.words || [];

  const words: WordEntry[] = [];
  for (const w of rawWords) {
    const original = String(w.text ?? "").trim();
    if (!original) continue;
    const latin = unidecode(original).trim();
    if (!latin) continue;
    words.push({
      word: latin,
      original,
      start: Math.round(Number(w.start ?? 0) * 1000) / 1000,
      end: Math.round(Number(w.end ?? 0) * 1000) / 1000,
    });
  }

  let duration = words.length ? words[words.length - 1].end : 0;
  const chars = payload.characters || [];
  if (chars.length) {
    const lastChar = chars[chars.length - 1];
    const cEnd = Number(lastChar?.end ?? duration);
    if (Number.isFinite(cEnd) && cEnd > duration) duration = cEnd;
  }

  // 4) Upsert into audio_timestamps (on_conflict: script_id,chunk_id).
  const { error: upErr } = await supabaseAdmin
    .from("audio_timestamps")
    .upsert(
      {
        script_id: scriptId,
        chunk_id: chunkId,
        chunk_number: chunkNumber,
        words: JSON.stringify(words),
      },
      { onConflict: "script_id,chunk_id" },
    );
  if (upErr) throw new Error(`upsert audio_timestamps failed: ${upErr.message}`);

  return { wordCount: words.length, duration };
}

export const runTimestamps = createServerFn({ method: "POST" })
  .inputValidator((input) => RunInput.parse(input))
  .handler(async ({ data }) => {
    console.log(`[TS/eleven] chunk ${data.chunkNumber} (${data.chunkId})`);
    const result = await alignOneChunk(
      data.scriptId,
      data.chunkId,
      data.chunkNumber,
    );
    console.log(
      `[TS/eleven] chunk ${data.chunkNumber} done — ${result.wordCount} words / ${result.duration.toFixed(2)}s`,
    );
    return {
      ok: true,
      word_count: result.wordCount,
      duration: result.duration,
    };
  });

export const runTimestampsAll = createServerFn({ method: "POST" })
  .inputValidator((input) => RunAllInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: chunks, error } = await supabaseAdmin
      .from("script_chunks")
      .select("id,chunk_index")
      .eq("script_id", data.scriptId)
      .order("chunk_index");
    if (error) throw new Error(`load chunks failed: ${error.message}`);

    const list = chunks || [];
    console.log(`[TS/eleven] run-all: ${list.length} chunks`);

    let ok = 0;
    const failures: Array<{ chunk_index: number; error: string }> = [];

    // Run sequentially so we don't hammer the ElevenLabs API.
    for (const c of list) {
      try {
        await alignOneChunk(data.scriptId, c.id, c.chunk_index);
        ok += 1;
        console.log(`[TS/eleven] run-all chunk ${c.chunk_index} OK`);
      } catch (err: any) {
        const msg = err?.message || String(err);
        console.error(`[TS/eleven] run-all chunk ${c.chunk_index} FAILED: ${msg}`);
        failures.push({ chunk_index: c.chunk_index, error: msg });
      }
    }

    return {
      ok: true,
      queued: list.length,
      succeeded: ok,
      failed: failures.length,
      failures,
    };
  });
