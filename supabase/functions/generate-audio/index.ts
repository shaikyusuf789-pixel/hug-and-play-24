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
    const { chunkId, provider = "elevenlabs", voiceId } = await req.json();
    if (!chunkId) return json({ error: "chunkId required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: chunk, error: chunkErr } = await supabase
      .from("script_chunks")
      .select("id, content, chunk_index, script_id")
      .eq("id", chunkId)
      .maybeSingle();

    if (chunkErr || !chunk) return json({ error: "Chunk not found" }, 400);
    if (!chunk.content?.trim()) return json({ error: "Chunk content empty" }, 400);

    let audioBytes: Uint8Array;
    let contentType = "audio/mpeg";
    let ext = "mp3";

    if (provider === "elevenlabs") {
      const key = Deno.env.get("ELEVEN_LABS_API_KEY");
      if (!key) return json({ error: "ELEVEN_LABS_API_KEY not set" }, 500);
      const vId = voiceId || "JBFqnCBsd6RMkjVDRZzb";
      const r = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${vId}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: { "xi-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({
            text: chunk.content,
            model_id: "eleven_v3",
          }),
        },
      );
      if (!r.ok) {
        const t = await r.text();
        return json({ error: `ElevenLabs failed: ${t}` }, 400);
      }
      audioBytes = new Uint8Array(await r.arrayBuffer());
    } else {
      return json({ error: `Unsupported provider: ${provider}` }, 400);
    }

    const path = `${chunk.script_id}/${chunk.chunk_index}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, audioBytes, { contentType, upsert: true });

    if (upErr) return json({ error: `Upload failed: ${upErr.message}` }, 400);

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const audio_url = pub.publicUrl;

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
