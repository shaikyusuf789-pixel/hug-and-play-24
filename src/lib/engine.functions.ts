import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";


export const runIdeaEngine = createServerFn({ method: "POST" })
  .inputValidator(z.object({ sourceId: z.string().uuid().optional() }).optional())
  .handler(async ({ data: inputData }) => {
    console.log("Starting Idea Engine run via Edge Function...");
    
    const { data, error } = await supabaseAdmin.functions.invoke("run-engine", {
      body: { sourceId: inputData?.sourceId }
    });

    if (error) throw error;
    return data;
  });


const SourceInput = z.object({
  type: z.string().default("youtube"),
  channel_name: z.string().min(1),
  source_url: z.string().url(),
});

export const addSource = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SourceInput.parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("sources_master").upsert(data, { onConflict: 'source_url', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSource = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("sources_master").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkAddSources = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.array(SourceInput).parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("sources_master").upsert(data, { onConflict: 'source_url', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { ok: true, count: data.length };
  });

export const getIdeas = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ status: z.string().optional() }).parse(d))
  .handler(async ({ data }) => {
    let query = supabaseAdmin
      .from("raw_content")
      .select("*, sources_master(channel_name)")
      .order("created_at", { ascending: false });

    if (data.status) {
      query = query.eq("status", data.status);
    }

    const { data: ideas, error } = await query;
    if (error) throw error;
    return { ideas: (ideas || []) as any[] };
  });

export const updateIdeaStatus = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().uuid(), status: z.string() }))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("raw_content")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const getAutoRunSettings = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "engine_auto_run")
      .maybeSingle();
    if (error) throw error;
    return (data?.value || { enabled: false, interval_hrs: 1, last_run: null }) as {
      enabled: boolean;
      interval_hrs: number;
      last_run: string | null;
    };
  });

export const updateAutoRunSettings = createServerFn({ method: "POST" })
  .inputValidator(z.object({ enabled: z.boolean(), interval_hrs: z.number() }))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert({ key: "engine_auto_run", value: data }, { onConflict: "key" });
    if (error) throw error;
    return { ok: true };
  });

export const updateLastRunTimestamp = createServerFn({ method: "POST" })
  .handler(async () => {
    const { data: current } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "engine_auto_run")
      .single();
    
    const newValue = { ...(current?.value as any || {}), last_run: new Date().toISOString() };
    await supabaseAdmin.from("app_settings").update({ value: newValue }).eq("key", "engine_auto_run");
    return { ok: true };
  });

export const approveAndProcessIdea = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data: { id } }) => {
    console.log(`Approving and processing idea via Edge Function: ${id}`);
    
    const { data, error } = await supabaseAdmin.functions.invoke("process-idea", {
      body: { id }
    });

    if (error) throw error;
    return data;
  });


export const saveScript = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    idea_id: z.string().uuid().optional(),
    title: z.string(),
    content: z.string(),
    word_count: z.number().optional(),
    video_type: z.string().optional(),
    model: z.string().optional(),
  }))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("scripts").insert(data);
    if (error) throw error;
    return { ok: true };
  });

export const getRecentScripts = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("scripts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw error;
    return { scripts: data || [] };
  });

export const updateScript = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    id: z.string().uuid(),
    content: z.string(),
  }))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("scripts")
      .update({ content: data.content, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const saveChunks = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    script_id: z.string().uuid(),
    chunks: z.array(z.string()),
  }))
  .handler(async ({ data }) => {
    // Delete existing chunks for this script first
    await supabaseAdmin.from("script_chunks").delete().eq("script_id", data.script_id);
    
    const chunksToInsert = data.chunks.map((content, index) => ({
      script_id: data.script_id,
      chunk_index: index,
      content,
      word_count: content.trim().split(/\s+/).length,
      status: 'PENDING'
    }));

    const { error } = await supabaseAdmin.from("script_chunks").insert(chunksToInsert);
    if (error) throw error;
    return { ok: true };
  });

export const updateChunk = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    id: z.string().uuid(),
    content: z.string(),
  }))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("script_chunks")
      .update({ content: data.content, word_count: data.content.trim().split(/\s+/).length, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const getYoutubeSeo = createServerFn({ method: "GET" })
  .inputValidator(z.object({ script_id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { data: seo, error } = await supabaseAdmin
      .from("youtube_seo")
      .select("*")
      .eq("script_id", data.script_id)
      .maybeSingle();
    if (error) throw error;
    return { seo };
  });

export const saveYoutubeSeo = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    script_id: z.string().uuid(),
    title_variations: z.array(z.string()).optional(),
    selected_title: z.string().optional(),
    tags: z.array(z.string()).optional(),
    description: z.string().optional(),
    thumbnail_lines: z.any().optional(),
    thumbnail_prompt: z.string().optional(),
    thumbnail_url: z.string().optional(),
  }))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("youtube_seo")
      .upsert(data, { onConflict: 'script_id' });
    if (error) throw error;
    return { ok: true };
  });
