/**
 * timestamps.functions.ts — Word-level timestamps via ElevenLabs Forced Alignment.
 *
 * Per project Rule 5: Timestamps = ElevenLabs Forced Alignment.
 * Reads chunk audio_url from script_chunks (handles .mp3/.wav transparently)
 * and posts the audio + transcript to ElevenLabs /v1/forced-alignment.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const RunInput = z.object({
  scriptId: z.string().uuid(),
  chunkId: z.string().uuid(),
  chunkNumber: z.number().int().nonnegative(),
});

const RunAllInput = z.object({
  scriptId: z.string().uuid(),
});

async function alignChunk(chunkId: string): Promise<{ word_count: number; duration: number }> {
  const apiKey = process.env.ELEVEN_LABS_API_KEY;
  if (!apiKey) throw new Error("ELEVEN_LABS_API_KEY is not set");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Load chunk: content + audio_url
  const { data: chunk, error: chunkErr } = await supabaseAdmin
    .from("script_chunks")
    .select("id, script_id, chunk_index, content, audio_url")
    .eq("id", chunkId)
    .single();
  if (chunkErr || !chunk) throw new Error(`Chunk not found: ${chunkId}`);
  if (!chunk.audio_url) throw new Error(`Chunk ${chunk.chunk_index} has no audio_url`);
  if (!chunk.content) throw new Error(`Chunk ${chunk.chunk_index} has no content`);

  // Download audio from the stored URL (correct extension, .mp3 or .wav)
  const audioRes = await fetch(chunk.audio_url);
  if (!audioRes.ok) throw new Error(`Failed to download audio: ${audioRes.status} ${audioRes.statusText}`);
  const audioBlob = await audioRes.blob();

  // Call ElevenLabs Forced Alignment
  const form = new FormData();
  form.append("file", audioBlob, `audio_${chunk.chunk_index + 1}.mp3`);
  form.append("text", chunk.content as string);


  const elRes = await fetch("https://api.elevenlabs.io/v1/forced-alignment", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });
  if (!elRes.ok) {
    const errText = await elRes.text();
    throw new Error(`ElevenLabs forced-alignment failed: ${elRes.status} ${errText}`);
  }
  const aligned = (await elRes.json()) as {
    words?: Array<{ text: string; start: number; end: number }>;
    characters?: Array<{ text: string; start: number; end: number }>;
  };

  const words = (aligned.words || []).map((w) => ({
    word: w.text,
    start: Number(w.start.toFixed(3)),
    end: Number(w.end.toFixed(3)),
  }));
  const duration = words.length ? words[words.length - 1].end : 0;

  const { error: upErr } = await supabaseAdmin
    .from("audio_timestamps")
    .upsert(
      {
        script_id: chunk.script_id as string,
        chunk_id: chunk.id,
        chunk_number: chunk.chunk_index,
        words: JSON.stringify(words),
      },
      { onConflict: "script_id,chunk_id" },
    );
  if (upErr) throw new Error(`DB upsert failed: ${upErr.message}`);

  return { word_count: words.length, duration };
}

export const runTimestamps = createServerFn({ method: "POST" })
  .inputValidator((input) => RunInput.parse(input))
  .handler(async ({ data }) => {
    console.log(`[TS/EL] chunk ${data.chunkNumber} (${data.chunkId})`);
    const res = await alignChunk(data.chunkId);
    console.log(`[TS/EL] chunk ${data.chunkNumber} done — ${res.word_count} words / ${res.duration.toFixed(2)}s`);
    return { ok: true, word_count: res.word_count, duration: res.duration };
  });

export const runTimestampsAll = createServerFn({ method: "POST" })
  .inputValidator((input) => RunAllInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: chunks, error } = await supabaseAdmin
      .from("script_chunks")
      .select("id, chunk_index")
      .eq("script_id", data.scriptId)
      .order("chunk_index", { ascending: true });
    if (error) throw new Error(error.message);

    let succeeded = 0;
    const failures: Array<{ chunk_index: number; error: string }> = [];
    for (const c of chunks || []) {
      try {
        await alignChunk(c.id);
        succeeded++;
      } catch (e: any) {
        failures.push({ chunk_index: c.chunk_index, error: String(e?.message || e) });
      }
    }
    return {
      ok: failures.length === 0,
      queued: chunks?.length || 0,
      succeeded,
      failed: failures.length,
      failures,
    };
  });
