import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"
import JSZip from "https://esm.sh/jszip@3.10.1"
import { geminiGenerateText, requireGoogleApiKey } from "../_shared/google-ai.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GAMMA_API = "https://public-api.gamma.app/v1.0/generations"

// SERVICE-ROLE ONLY. Writes to script_chunks and uploads to `slides` bucket
// both require service-role auth. Never fall back to publishable/anon keys.
// SUPABASE_SECRET_KEYS may contain multiple sb_secret_ tokens (retired + current);
// we probe each against SUPABASE_URL and cache the first one that works.
let _cachedServiceKey: string | null = null

async function probeServiceKey(url: string, key: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/rest/v1/script_chunks?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
    return res.status !== 401 && res.status !== 403
  } catch {
    return false
  }
}

async function getSupabaseServiceKey(): Promise<string> {
  if (_cachedServiceKey) return _cachedServiceKey
  const url = Deno.env.get("SUPABASE_URL") ?? ""

  const candidates: string[] = []
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS") ?? ""
  const matches = raw.match(/sb_secret_[A-Za-z0-9_-]+/g) ?? []
  candidates.push(...matches)
  const custom = Deno.env.get("CUSTOM_SUPABASE_SERVICE_ROLE_KEY")?.trim()
  if (custom) candidates.push(custom)
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim()
  if (legacy) candidates.push(legacy)

  if (candidates.length === 0) {
    throw new Error("No service-role key available (SUPABASE_SECRET_KEYS / CUSTOM_SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY all missing)")
  }

  for (const key of candidates) {
    if (await probeServiceKey(url, key)) {
      _cachedServiceKey = key
      console.log(`[generate-slides] using service key prefix=${key.slice(0, 14)}... (${candidates.indexOf(key) + 1}/${candidates.length})`)
      return key
    }
  }
  throw new Error(`All ${candidates.length} service-role key candidate(s) rejected by ${url} (likely retired keys from old project ref)`)
}

function readPngDimensions(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

let themeCache: { map: Map<string, string>; expiresAt: number } | null = null

async function resolveThemeId(apiKey: string, themeName: string): Promise<string | null> {
  const now = Date.now()
  if (!themeCache || themeCache.expiresAt < now) {
    const res = await fetch("https://public-api.gamma.app/v1.0/themes", {
      headers: { "X-API-KEY": apiKey },
    })
    if (!res.ok) {
      const t = await res.text()
      throw new Error(`Gamma themes fetch failed (${res.status}): ${t}`)
    }
    const body = await res.json()
    const list: Array<{ id: string; name: string }> = body.themes || body.data || (Array.isArray(body) ? body : [])
    const map = new Map<string, string>()
    for (const t of list) {
      if (t?.id && t?.name) map.set(t.name.toLowerCase().trim(), t.id)
    }
    themeCache = { map, expiresAt: now + 10 * 60 * 1000 }
  }
  return themeCache.map.get(themeName.toLowerCase().trim()) ?? null
}

async function callGamma(inputText: string, themeName: string, supabase: ReturnType<typeof createClient>, scriptId: string, chunkIndex: number) {
  const apiKey = Deno.env.get("GAMMA_API_KEY")
  if (!apiKey) throw new Error("GAMMA_API_KEY is not configured")

  const themeId = await resolveThemeId(apiKey, themeName)
  if (!themeId) console.warn(`Gamma theme "${themeName}" not found; using default.`)

  const strictInstructions = [
    "PRESERVE MODE — the input text is FINAL COPY. Reproduce every word EXACTLY as provided. Do NOT rewrite, paraphrase, summarize, condense, expand, translate, reorder, add, or remove ANY word, bullet, punctuation, or line break.",
    "Output exactly one 16:9 widescreen slide (1920x1080) for YouTube/PowerPoint. Not a document, webpage, social post, square or vertical card. No fluid/tall/scrolling layout.",
    "Layout: title at top, balanced two-column or compact grid below. USE THE FULL SLIDE AREA — spread content edge-to-edge so the slide is comfortably filled, not crammed into a small center block.",
    "TYPOGRAPHY (CRITICAL): font sizes must be MODERATE and clearly readable on a TV/YouTube thumbnail — NOT tiny ant-sized text and NOT giant elephant-sized text. Target body/bullet text around 28–36pt and heading around 48–60pt on a 1920x1080 canvas. Prefer adding a second column or expanding the layout over shrinking the font.",
    `Visual style: apply the ${themeName} theme. Include one relevant AI-generated image that fits the slide topic.`,
  ].join(" ")

  const payload: Record<string, unknown> = {
    inputText,
    textMode: "preserve",
    format: "presentation",
    numCards: 1,
    cardSplit: "inputTextBreaks",
    exportAs: "png",
    textOptions: { amount: "brief", language: "en" },
    additionalInstructions: strictInstructions,
    cardOptions: { dimensions: "16x9" },
    imageOptions: { source: "aiGenerated", model: "imagen-3-pro", style: "photorealistic" },
  }
  if (themeId) payload.themeId = themeId

  // Kick off generation — textMode "preserve" forces Gamma to keep input text verbatim.
  const startRes = await fetch(GAMMA_API, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
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

        const slideNumber = String((chunkIndex ?? 0) + 1).padStart(3, "0")
        const path = `${scriptId}/slide_${slideNumber}.png`
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
    const supabaseKey = getSupabaseServiceKey()
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: chunk, error: fetchError } = await supabase
      .from('script_chunks')
      .select('content, slide_prompt, annotations, script_id, chunk_index')
      .eq('id', chunkId)
      .single()

    if (fetchError || !chunk) throw new Error(`Chunk not found: ${fetchError?.message || 'no row'}`)

    if (action === 'generate-prompt') {
      const promptResult = await geminiGenerateText(requireGoogleApiKey(), {
        model: 'gemini-2.5-flash-lite',
        system: `You are an expert at creating slide content. ALWAYS write the output in ENGLISH ONLY, regardless of the input language. If the source text is in Telugu, Hindi, or any non-English language, translate the meaning into clear, natural English first, then produce the slide. Your output must be exactly one English heading followed by 5 to 8 SHORT English bullet points (max 12 words each). No transliteration, no native script, no other text.

COVERAGE RULE (CRITICAL):
The chunk may contain MULTIPLE distinct sub-topics (e.g. age limits AND educational qualifications, vacancy AND syllabus). You MUST cover EVERY sub-topic present in the chunk — never drop the second half. If there are two sub-topics, split bullets across both (e.g. 3+3 or 4+4). When helpful, prefix bullets with a short sub-topic tag like "Age:" or "Education:" so both topics are visibly represented.

CRITICAL — VOCABULARY REUSE RULE:
The bullets will later be matched word-for-word against the spoken audio of this same chunk. To make that alignment work, REUSE the exact same English words, phrases, and key nouns/verbs that already appear (or are the direct English translation of) the source chunk. Prefer the chunk's own vocabulary over fancy synonyms. Keep numbers, names, brand terms, and technical words verbatim. Short, plain bullets that echo the chunk's wording > clever rephrased bullets.`,
        user: `Source chunk (this is the FINAL spoken script — may be in any language; translate to English while keeping the same words/phrases wherever possible):\n\n${chunk.content}\n\nProduce: one English heading and 5 to 8 SHORT English bullet points (max 12 words each). English only. COVER EVERY sub-topic in the chunk — do not drop the second half if the chunk has two themes. REUSE the chunk's own words/phrases as much as possible. Keep bullets tight and moderately sized so the slide fills the full area with comfortable, readable (not ant-sized) font.`,
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
      const gamma = await callGamma(inputText, theme, supabase, chunk.script_id as string, chunk.chunk_index as number)

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
