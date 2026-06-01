import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"
import { geminiGenerateText, requireGoogleApiKey } from "../_shared/google-ai.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GAMMA_API = "https://public-api.gamma.app/v1.0/generations"

async function callGamma(inputText: string, themeName: string) {
  const apiKey = Deno.env.get("GAMMA_API_KEY")
  if (!apiKey) throw new Error("GAMMA_API_KEY is not configured")

  // Kick off generation
  const startRes = await fetch(GAMMA_API, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputText,
      textMode: "preserve",          // <-- PRESERVE TEXT
      format: "presentation",
      numCards: 1,
      cardSplit: "auto",
      additionalInstructions: `Use the "${themeName}" visual theme.`,
      cardOptions: { dimensions: "16x9" }, // <-- strict 16:9 traditional
      imageOptions: { source: "noImages" },
    }),
  })

  if (!startRes.ok) {
    const t = await startRes.text()
    throw new Error(`Gamma start failed (${startRes.status}): ${t}`)
  }
  const { generationId } = await startRes.json()
  if (!generationId) throw new Error("Gamma: no generationId returned")

  // Poll for completion (max ~3 min)
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const pollRes = await fetch(`${GAMMA_API}/${generationId}`, {
      headers: { "X-API-KEY": apiKey },
    })
    if (!pollRes.ok) continue
    const data = await pollRes.json()
    if (data.status === "completed" && data.gammaUrl) {
      return data.gammaUrl as string
    }
    if (data.status === "failed") {
      throw new Error(`Gamma generation failed: ${data.error || "unknown"}`)
    }
  }
  throw new Error("Gamma generation timed out")
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { chunkId, action, themeName } = await req.json()

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: chunk, error: fetchError } = await supabase
      .from('script_chunks')
      .select('content, slide_prompt')
      .eq('id', chunkId)
      .single()

    if (fetchError || !chunk) throw new Error('Chunk not found')

    if (action === 'generate-prompt') {
      const promptResult = await geminiGenerateText(requireGoogleApiKey(), {
        model: 'gemini-2.5-flash-lite',
        system: 'You are an expert at creating slide content. ALWAYS write the output in ENGLISH ONLY, regardless of the input language. If the source text is in Telugu, Hindi, or any non-English language, translate the meaning into clear, natural English first, then produce the slide. Your output must be exactly one English heading followed by exactly 6 English bullet points. No transliteration, no native script, no other text.',
        user: `Source text (may be in any language — translate to English):\n\n${chunk.content}\n\nProduce: one English heading and exactly 6 English bullet points. English only.`,
        temperature: 0.2,
      })

      const { error: updateError } = await supabase
        .from('script_chunks')
        .update({ slide_prompt: promptResult })
        .eq('id', chunkId)
      if (updateError) throw updateError

      return new Response(JSON.stringify({ success: true, prompt: promptResult }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'generate-slide') {
      const inputText = (chunk.slide_prompt || chunk.content || "").trim()
      if (!inputText) throw new Error("Chunk has no outline/content to send to Gamma")

      const theme = (themeName && String(themeName).trim()) || "Oasis"
      const gammaUrl = await callGamma(inputText, theme)

      const { error: updateError } = await supabase
        .from('script_chunks')
        .update({ status: 'slide_generated', slide_url: gammaUrl })
        .eq('id', chunkId)
      if (updateError) throw updateError

      return new Response(JSON.stringify({ success: true, slide_url: gammaUrl }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
