// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "audio-files";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { chunkId, provider = "elevenlabs", voiceId, model } = await req.json();
    if (!chunkId) return json({ error: "chunkId required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: chunk, error: chunkErr } = await supabase
      .from("script_chunks")
      .select("id, content, chunk_index, script_id, audio_url")
      .eq("id", chunkId)
      .maybeSingle();

    if (chunkErr || !chunk) return json({ error: "Chunk not found" }, 400);
    if (!chunk.content?.trim()) return json({ error: "Chunk content empty" }, 400);

    // Delete previous audio file (regenerate = replace)
    if (chunk.audio_url) {
      try {
        const marker = `/object/public/${BUCKET}/`;
        const i = chunk.audio_url.indexOf(marker);
        if (i !== -1) {
          const oldPath = decodeURIComponent(chunk.audio_url.substring(i + marker.length).split("?")[0]);
          await supabase.storage.from(BUCKET).remove([oldPath]);
        }
      } catch (_e) { /* ignore cleanup errors */ }
    }

    let audioBytes: Uint8Array;
    let contentType = "audio/mpeg";
    let ext = "mp3";

    if (provider === "elevenlabs") {
      const key = Deno.env.get("ELEVEN_LABS_API_KEY");
      if (!key) return json({ error: "ELEVEN_LABS_API_KEY not set" }, 500);
      const vId = voiceId || "UusdT1frXE5G4cvEE2dJ";
      const r = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${vId}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: { "xi-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({
            text: chunk.content,
            model_id: model || "eleven_v3",
          }),
        },
      );
      if (!r.ok) {
        const t = await r.text();
        return json({ error: `ElevenLabs failed: ${t}` }, 400);
      }
      audioBytes = new Uint8Array(await r.arrayBuffer());
    } else if (provider === "cartesia") {
      const key = Deno.env.get("CARTESIA_API_KEY");
      if (!key) return json({ error: "CARTESIA_API_KEY not set" }, 500);
      const vId = voiceId;
      if (!vId) return json({ error: "Cartesia voiceId required" }, 400);
      const modelId = model || "sonic-3-latest";
      const r = await fetch("https://api.cartesia.ai/tts/bytes", {
        method: "POST",
        headers: {
          "X-API-Key": key,
          "Cartesia-Version": "2024-11-13",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model_id: modelId,
          transcript: chunk.content,
          voice: { mode: "id", id: vId },
          output_format: {
            container: "mp3",
            sample_rate: 44100,
            bit_rate: 128000,
          },
          language: "te",
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        return json({ error: `Cartesia failed: ${t}` }, 400);
      }
      audioBytes = new Uint8Array(await r.arrayBuffer());
    } else if (provider === "google") {
      const key = Deno.env.get("GOOGLE_API_KEY");
      if (!key) return json({ error: "GOOGLE_API_KEY not set" }, 500);
      const voiceName = voiceId || "Charon";
      const modelId = model || "gemini-2.5-pro-preview-tts";
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: chunk.content }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName },
                },
              },
            },
          }),
        },
      );
      if (!r.ok) {
        const t = await r.text();
        return json({ error: `Google TTS failed: ${t}` }, 400);
      }
      const data = await r.json();
      const part = data?.candidates?.[0]?.content?.parts?.find(
        (p: any) => p?.inlineData?.data,
      );
      if (!part) return json({ error: "Google TTS returned no audio" }, 400);
      const mimeType: string = part.inlineData.mimeType || "audio/L16;rate=24000";
      const pcm = base64ToBytes(part.inlineData.data);
      // Wrap PCM into WAV. Parse rate from mime like "audio/L16;codec=pcm;rate=24000"
      const rateMatch = mimeType.match(/rate=(\d+)/);
      const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
      audioBytes = pcmToWav(pcm, sampleRate, 1, 16);
      contentType = "audio/wav";
      ext = "wav";
    } else {
      return json({ error: `Unsupported provider: ${provider}` }, 400);
    }

    const audioNumber = String((chunk.chunk_index ?? 0) + 1).padStart(3, "0");
    const path = `${chunk.script_id}/audio_${audioNumber}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, audioBytes, { contentType, upsert: true });

    if (upErr) return json({ error: `Upload failed: ${upErr.message}` }, 400);

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const audio_url = `${pub.publicUrl}?t=${Date.now()}`;

    await supabase
      .from("script_chunks")
      .update({ audio_url, updated_at: new Date().toISOString() })
      .eq("id", chunkId);

    return json({ ok: true, audio_url });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function pcmToWav(
  pcm: Uint8Array,
  sampleRate: number,
  channels: number,
  bitsPerSample: number,
): Uint8Array {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcm.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  let o = 0;
  const writeStr = (s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o++, s.charCodeAt(i)); };
  writeStr("RIFF");
  view.setUint32(o, 36 + dataSize, true); o += 4;
  writeStr("WAVE");
  writeStr("fmt ");
  view.setUint32(o, 16, true); o += 4;
  view.setUint16(o, 1, true); o += 2; // PCM
  view.setUint16(o, channels, true); o += 2;
  view.setUint32(o, sampleRate, true); o += 4;
  view.setUint32(o, byteRate, true); o += 4;
  view.setUint16(o, blockAlign, true); o += 2;
  view.setUint16(o, bitsPerSample, true); o += 2;
  writeStr("data");
  view.setUint32(o, dataSize, true); o += 4;
  new Uint8Array(buffer, 44).set(pcm);
  return new Uint8Array(buffer);
}
