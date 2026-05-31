import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { chunkId, provider, voiceId, model } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const elevenKey = Deno.env.get("ELEVEN_LABS_API_TOKEN") || Deno.env.get("ELEVEN_LABS_API_KEY");
    const geminiKey = Deno.env.get("GOOGLE_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch chunk content
    const { data: chunk, error: fetchErr } = await supabase
      .from("script_chunks")
      .select("content, script_id")
      .eq("id", chunkId)
      .single();
    
    if (fetchErr || !chunk) throw new Error("Chunk not found");

    let audioBuffer: Uint8Array;

    if (provider === "elevenlabs") {
      if (!elevenKey) throw new Error("ELEVEN_LABS_API_KEY not configured");
      
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": elevenKey,
        },
        body: JSON.stringify({
          text: chunk.content,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`ElevenLabs failed: ${err}`);
      }
      audioBuffer = new Uint8Array(await res.arrayBuffer());
    } else {
      // Default to Google/Gemini if specified or as fallback
      // Since Gemini TTS might be a specialized endpoint or part of Gemini 2.0
      // We'll use a placeholder or implement if possible. 
      // If the user meant standard Google Cloud TTS:
      if (!geminiKey) throw new Error("GOOGLE_API_KEY not configured");
      
      // Placeholder for actual TTS implementation if it's a specific API
      // For now, let's assume it's a standard fetch to a TTS service
      throw new Error(`TTS Provider ${provider} implementation pending in Edge Function.`);
    }

    // Upload to Supabase Storage
    const fileName = `${chunk.script_id}/${chunkId}.mp3`;
    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from("audio-outputs")
      .upload(fileName, audioBuffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (uploadErr) throw uploadErr;

    const { data: { publicUrl } } = supabase.storage
      .from("audio-outputs")
      .getPublicUrl(fileName);

    // Update chunk with audio URL
    await supabase
      .from("script_chunks")
      .update({ audio_url: publicUrl, status: 'DONE' })
      .eq("id", chunkId);

    return new Response(JSON.stringify({ ok: true, url: publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
