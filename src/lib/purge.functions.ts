/**
 * purge.functions.ts — Wipes all generated media (audio, slides, clips, mega)
 * from Supabase Storage and clears their URL columns in the DB.
 *
 * Buckets purged: audio-files, slides, video-clips
 * DB clears:
 *   - script_chunks.audio_url, slide_url, slide_id, slide_prompt
 *   - scripts.final_audio_url
 *   - video_clips rows deleted
 */

import { createServerFn } from "@tanstack/react-start";

const BUCKETS = ["audio-files", "slides", "video-clips"] as const;

async function listAllPaths(admin: any, bucket: string): Promise<string[]> {
  const paths: string[] = [];

  async function walk(prefix: string) {
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await admin.storage.from(bucket).list(prefix, {
        limit: pageSize,
        offset,
      });
      if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
      if (!data || data.length === 0) break;

      for (const item of data) {
        const full = prefix ? `${prefix}/${item.name}` : item.name;
        // Folders have no id (or no metadata). Files have id + metadata.
        if (item.id === null || (!item.metadata && !item.id)) {
          await walk(full);
        } else {
          paths.push(full);
        }
      }

      if (data.length < pageSize) break;
      offset += pageSize;
    }
  }

  await walk("");
  return paths;
}

export const purgeAllMedia = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const result: Record<string, number> = {};

  // 1. Purge storage buckets
  for (const bucket of BUCKETS) {
    const paths = await listAllPaths(supabaseAdmin, bucket);
    result[bucket] = paths.length;
    // Remove in batches of 1000 (Supabase remove limit)
    for (let i = 0; i < paths.length; i += 1000) {
      const batch = paths.slice(i, i + 1000);
      const { error } = await supabaseAdmin.storage.from(bucket).remove(batch);
      if (error) throw new Error(`remove ${bucket}: ${error.message}`);
    }
  }

  // 2. Clear DB url columns
  const { error: e1 } = await supabaseAdmin
    .from("script_chunks")
    .update({
      audio_url: null,
      slide_url: null,
      slide_id: null,
      slide_prompt: null,
      audio_job_status: "idle",
      slide_job_status: "idle",
      audio_job_error: null,
      slide_job_error: null,
    })
    .not("id", "is", null);
  if (e1) throw new Error(`script_chunks update: ${e1.message}`);

  const { error: e2 } = await supabaseAdmin
    .from("scripts")
    .update({ final_audio_url: null })
    .not("id", "is", null);
  if (e2) throw new Error(`scripts update: ${e2.message}`);

  const { error: e3 } = await supabaseAdmin
    .from("video_clips")
    .delete()
    .not("id", "is", null);
  if (e3) throw new Error(`video_clips delete: ${e3.message}`);

  return { ok: true, deleted: result };
});
