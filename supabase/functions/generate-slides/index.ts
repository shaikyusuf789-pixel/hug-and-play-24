import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"
import JSZip from "https://esm.sh/jszip@3.10.1"
import { geminiGenerateText, requireGoogleApiKey } from "../_shared/google-ai.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GAMMA_API = "https://public-api.gamma.app/v1.0/generations"

function readPngDimensions(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

async function callGamma(inputText: string, themeName: string, supabase: ReturnType<typeof createClient>, chunkId: string) {
  const apiKey = Deno.env.get("GAMMA_API_KEY")
  if (!apiKey) throw new Error("GAMMA_API_KEY is not configured")

  const strictInstructions = [
    "STRICT OUTPUT: create exactly one 16:9 widescreen presentation slide, not a document, webpage, social post, square card, or vertical card.",
    "The card canvas must be fixed widescreen 16:9, suitable for YouTube and PowerPoint (1920x1080). Do not use fluid/tall/scrolling layout.",
    "Use a traditional PowerPoint-style slide: title at top, compact 3x2 grid or balanced two-column card layout below.",
    "Preserve the provided English heading and bullet text exactly. Do not rewrite, summarize, translate, add, or remove text.",
    "Fit all preserved text within the 16:9 canvas by reducing font size, tightening spacing, and using compact content blocks. Never increase card height.",
    `Apply a polished ${themeName} inspired visual style if available.`,
  ].join(" ")

  // Kick off generation
  const startRes = await fetch(GAMMA_API, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputText,
      textMode: "preserve",
      format: "presentation",
      numCards: 1,
      cardSplit: "inputTextBreaks",
      exportAs: "png",
      textOptions: { language: "en" },
      additionalInstructions: strictInstructions,
      cardOptions: { dimensions: "16x9" },
      imageOptions: { source: "noImages" },
    }),
  })

  if (!startRes.ok) {
    const t = await startRes.text()
    throw new Error(`Gamma start failed (${startRes.status}): ${t}`)
  }
  const { generationId, warnings } = await startRes.json()
  if (warnings) console.warn("Gamma generation warnings:", warnings)
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
      let previewUrl: string | null = null
      let dimensions: { width: number; height: number } | null = null

      if (data.exportUrl) {
        const exportRes = await fetch(data.exportUrl)
        if (!exportRes.ok) throw new Error(`Gamma PNG export download failed (${exportRes.status})`)
        const exportBytes = new Uint8Array(await exportRes.arrayBuffer())
        let pngBytes: Uint8Array | null = null

        const isPng = exportBytes[0] === 0x89 && exportBytes[1] === 0x50 && exportBytes[2] === 0x4e && exportBytes[3] === 0x47
        if (isPng) {
          pngBytes = exportBytes
        } else {
          const zip = await JSZip.loadAsync(exportBytes.buffer.slice(exportBytes.byteOffset, exportBytes.byteOffset + exportBytes.byteLength))
          const pngFile = Object.values(zip.files).find((file) => !file.dir && file.name.toLowerCase().endsWith(".png"))
          if (!pngFile) throw new Error("Gamma PNG export did not contain a PNG slide")
          pngBytes = new Uint8Array(await pngFile.async("uint8array"))
        }

        dimensions = readPngDimensions(pngBytes)
        const ratio = dimensions.width / dimensions.height
        if (Math.abs(ratio - 16 / 9) > 0.02) {
          throw new Error(`Gamma did not return a 16:9 PNG export (${dimensions.width}x${dimensions.height})`)
        }

        const path = `${chunkId}/${generationId}.png`
        const { error: uploadError } = await supabase.storage
          .from("slides")
          .upload(path, pngBytes, { contentType: "image/png", upsert: true })
        if (uploadError) throw uploadError

        const { data: publicData } = supabase.storage.from("slides").getPublicUrl(path)
        previewUrl = publicData.publicUrl
      }

      return {
        gammaUrl: data.gammaUrl as string,
        gammaId: data.gammaId as string | undefined,
        generationId,
        exportUrl: data.exportUrl as string | undefined,
        previewUrl,
        dimensions,
      }
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
      .select('content, slide_prompt, annotations')
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
      const gamma = await callGamma(inputText, theme, supabase, chunkId)

      const { error: updateError } = await supabase
        .from('script_chunks')
        .update({
          status: 'slide_generated',
          slide_url: gamma.gammaUrl,
          annotations: {
            ...(chunk.annotations && typeof chunk.annotations === 'object' ? chunk.annotations : {}),
            gamma: {
              preview_url: gamma.previewUrl,
              gamma_id: gamma.gammaId,
              generation_id: gamma.generationId,
              export_url: gamma.exportUrl,
              dimensions: gamma.dimensions,
              requested_dimensions: '16x9',
              verified_16x9: Boolean(gamma.dimensions),
            },
          },
        })
        .eq('id', chunkId)
      if (updateError) throw updateError

      return new Response(JSON.stringify({
        success: true,
        slide_url: gamma.gammaUrl,
        preview_url: gamma.previewUrl,
        dimensions: gamma.dimensions,
      }), {
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
