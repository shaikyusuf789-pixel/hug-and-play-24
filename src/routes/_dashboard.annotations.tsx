import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Play,
  Loader2,
  FileImage,
  Type,
  Clock,
  Sparkles,
  Film,
  Download,
  RefreshCcw, 
  CheckCircle2, 
  AlertCircle, 
  Trash2,
  Pencil,
  X,
  Save
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ANNOTATIONS_WORKER_URL } from "@/lib/worker";
import { runTimestamps, runTimestampsAll } from "@/lib/timestamps.functions";
import { runOcr as runOcrFn, runOcrAll as runOcrAllFn } from "@/lib/ocr.functions";
import { cn } from "@/lib/utils";
import { useServerFn } from "@tanstack/react-start";
import { updateChunk } from "@/lib/engine.functions";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_dashboard/annotations")({
  component: AnnotationsPage,
});

type SlideSource = "dalle" | "gamma" | "replit";

const SLIDE_SOURCES: { key: SlideSource; label: string; color: string }[] = [
  { key: "dalle", label: "DALL·E", color: "blue" },
  { key: "gamma", label: "Gamma", color: "amber" },
  { key: "replit", label: "Replit", color: "violet" },
];

async function workerPost(path: string, body: any) {
  const res = await fetch(`${ANNOTATIONS_WORKER_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) throw new Error(json?.detail || text || `HTTP ${res.status}`);
  return json;
}

async function workerGet(path: string) {
  const res = await fetch(`${ANNOTATIONS_WORKER_URL}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function AnnotationsPage() {
  const updateChunkFn = useServerFn(updateChunk);
  const [scripts, setScripts] = useState<any[]>([]);
  const [scriptId, setScriptId] = useState<string>("");
  const [slideSource, setSlideSource] = useState<SlideSource>("gamma");
  const [chunks, setChunks] = useState<any[]>([]);
  const [ocrMap, setOcrMap] = useState<Record<string, any>>({});
  const [tsMap, setTsMap] = useState<Record<string, any>>({});
  const [aiMap, setAiMap] = useState<Record<string, any>>({});
  const [clipMap, setClipMap] = useState<Record<string, any>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggleExp = (k: string) => setExpanded((e) => ({ ...e, [k]: !e[k] }));
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [mergeState, setMergeState] = useState<{ status: string; url?: string | null; error?: string | null; clip_count?: number }>({ status: "idle" });
  const scriptIdRef = useRef(scriptId);
  const slideSourceRef = useRef(slideSource);
  useEffect(() => { scriptIdRef.current = scriptId; }, [scriptId]);
  useEffect(() => { slideSourceRef.current = slideSource; }, [slideSource]);

  // ── fetch scripts
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("scripts").select("id,title,created_at").order("created_at", { ascending: false });
      setScripts(data || []);
      if (data && data.length && !scriptId) setScriptId(data[0].id);
    })();
  }, []);

  const refreshAll = async (sid: string, src: SlideSource) => {
    if (!sid) return;
    const [c, o, t, a, v, m] = await Promise.all([
      supabase.from("script_chunks").select("*").eq("script_id", sid).order("chunk_index"),
      supabase.from("ocr_results").select("*").eq("script_id", sid).eq("slide_source", src),
      supabase.from("audio_timestamps").select("*").eq("script_id", sid),
      supabase.from("clip_annotations").select("*").eq("script_id", sid).eq("slide_source", src),
      supabase.from("video_clips").select("*").eq("script_id", sid).eq("slide_source", src),
      supabase.from("app_metadata").select("value").eq("key", `merge:${sid}`).maybeSingle(),
    ]);
    setChunks(c.data || []);
    setOcrMap(Object.fromEntries((o.data || []).map((r: any) => [r.chunk_id, r])));
    setTsMap(Object.fromEntries((t.data || []).map((r: any) => [r.chunk_id, r])));
    setAiMap(Object.fromEntries((a.data || []).map((r: any) => [r.chunk_id, r])));
    setClipMap(Object.fromEntries((v.data || []).map((r: any) => [r.chunk_id, r])));
    setMergeState((m?.data as any)?.value || { status: "idle" });
  };

  useEffect(() => { refreshAll(scriptId, slideSource); }, [scriptId, slideSource]);

  // ── poll while any clip is rendering OR merge in progress
  useEffect(() => {
    if (!scriptId) return;
    const anyRendering = Object.values(clipMap).some((c: any) => c?.status === "rendering" || c?.status === "pending");
    const mergeActive = mergeState.status === "queued" || mergeState.status === "running";
    if (!anyRendering && !mergeActive && !bulkBusy) return;
    const t = setInterval(() => refreshAll(scriptId, slideSource), 4000);
    return () => clearInterval(t);
  }, [scriptId, slideSource, clipMap, mergeState, bulkBusy]);

  const setRowBusy = (k: string, v: boolean) => setBusy((b) => ({ ...b, [k]: v }));

  // ── per-chunk actions
  const runOcr = async (chunk: any) => {
    const k = `ocr:${chunk.id}`; setRowBusy(k, true);
    try {
      const res: any = await runOcrFn({ data: { scriptId, chunkId: chunk.id, chunkNumber: chunk.chunk_index, slideSource } });
      toast.success(`OCR done — chunk ${chunk.chunk_index} (${res.word_count} words via Google Vision)`);
      await refreshAll(scriptId, slideSource);
    } catch (e: any) { toast.error(`OCR failed: ${e.message}`); }
    finally { setRowBusy(k, false); }
  };

  const runTs = async (chunk: any) => {
    const k = `ts:${chunk.id}`; setRowBusy(k, true);
    try {
      const res = await runTimestamps({
        data: { scriptId: scriptId, chunkId: chunk.id, chunkNumber: chunk.chunk_index },
      });
      toast.success(`Timestamps done — chunk ${chunk.chunk_index} (${res.word_count} words via OpenAI Whisper)`);
      await refreshAll(scriptId, slideSource);
    } catch (e: any) { toast.error(`Timestamps failed: ${e.message}`); }
    finally { setRowBusy(k, false); }
  };


  const runAi = async (chunk: any) => {
    const k = `ai:${chunk.id}`; setRowBusy(k, true);
    try {
      const { data, error } = await supabase.functions.invoke("process-annotations", {
        body: {
          script_id: scriptId,
          chunk_id: chunk.id,
          chunk_number: chunk.chunk_index,
          slide_source: slideSource
        }
      });
      if (error) throw error;
      toast.success(`AI done — chunk ${chunk.chunk_index} (${data.annotation_count} annotations via GPT-4o)`);
      await refreshAll(scriptId, slideSource);
    } catch (e: any) { toast.error(`AI failed: ${e.message}`); }
    finally { setRowBusy(k, false); }
  };



  const renderClip = async (chunk: any) => {
    const k = `clip:${chunk.id}`; setRowBusy(k, true);
    try {
      await workerPost("/clips/render", { script_id: scriptId, chunk_id: chunk.id, chunk_number: chunk.chunk_index, slide_source: slideSource });
      toast.info(`Render queued — chunk ${chunk.chunk_index}`);
      await refreshAll(scriptId, slideSource);
    } catch (e: any) { toast.error(`Render failed: ${e.message}`); }
    finally { setRowBusy(k, false); }
  };
  
  const handleSaveChunk = async (chunk: any) => {
    if (!editDraft.trim()) {
      toast.error("Chunk content cannot be empty");
      return;
    }
    setIsSaving(true);
    try {
      await updateChunkFn({ data: { id: chunk.id, content: editDraft } });
      setChunks(prev => prev.map(c => c.id === chunk.id ? { ...c, content: editDraft } : c));
      setEditingId(null);
      toast.success("Chunk updated");
    } catch (e: any) {
      toast.error("Update failed: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  // ── bulk actions
  // Poll DB until all chunks for `scriptId` have a row in `table`
  // (or until timeout / scriptId/source changes).
  const pollUntilComplete = async (
    table: "audio_timestamps" | "ocr_results" | "video_clips",
    sid: string,
    src: SlideSource,
    label: string,
  ) => {
    const totalChunks = chunks.length || (await supabase
      .from("script_chunks").select("id", { count: "exact", head: true })
      .eq("script_id", sid)).count || 0;
    if (!totalChunks) return;
    const started = Date.now();
    const MAX_MS = 30 * 60_000; // 30 min hard cap (rendering can be slow)
    // Immediate refresh so any pre-existing "rendering" rows appear without waiting 4s.
    await refreshAll(sid, src);
    while (Date.now() - started < MAX_MS) {
      await new Promise((r) => setTimeout(r, 4000));
      if (scriptIdRef.current !== sid || slideSourceRef.current !== src) return;
      let count = 0;
      if (table === "ocr_results") {
        const { count: c } = await supabase.from("ocr_results")
          .select("chunk_id", { count: "exact", head: true })
          .eq("script_id", sid).eq("slide_source", src);
        count = c || 0;
      } else if (table === "audio_timestamps") {
        const { count: c } = await supabase.from("audio_timestamps")
          .select("chunk_id", { count: "exact", head: true })
          .eq("script_id", sid);
        count = c || 0;
      } else {
        const { count: c } = await supabase.from("video_clips")
          .select("chunk_id", { count: "exact", head: true })
          .eq("script_id", sid).eq("slide_source", src).eq("status", "done");
        count = c || 0;
      }
      await refreshAll(sid, src);
      if (count >= totalChunks) {
        toast.success(`${label}: ${count}/${totalChunks} chunks ready`);
        return;
      }
    }
    toast.warning(`${label}: still running after 30 min — refresh to check status`);
  };

  const bulk = async (label: string, path: string) => {
    if (!scriptId) return toast.error("Pick a script first");
    setBulkBusy(label);
    try {
      if (path === "/timestamps/run-all") {
        // Worker queues background tasks per chunk; poll DB until all rows land.
        const res = await runTimestampsAll({ data: { scriptId } });
        toast.info(`${label}: queued ${res.queued} chunks — waiting for results…`);
        await pollUntilComplete("audio_timestamps", scriptId, slideSource, label);
      } else if (path === "/ocr/run-all") {
        const res: any = await runOcrAllFn({ data: { scriptId, slideSource } });
        toast.info(`${label}: queued ${res.queued} chunks — waiting for results…`);
        await pollUntilComplete("ocr_results", scriptId, slideSource, label);
      } else if (path === "/ai/run-all") {
        // AI annotations now run via Supabase Edge Function (calling 2x GPT-4o pipeline)
        const pending = chunks.map(async (c) => {
          return supabase.functions.invoke("process-annotations", {
            body: { script_id: scriptId, chunk_id: c.id, chunk_number: c.chunk_index, slide_source: slideSource }
          });
        });
        await Promise.all(pending);
        toast.success(`${label}: Processed all chunks via GPT-4o pipeline`);
      } else if (path === "/clips/render-all") {
        // Seed every chunk with annotations to status='rendering' so previews flip immediately.
        const seedRows = chunks
          .filter((c) => !!aiMap[c.id])
          .map((c) => ({
            script_id: scriptId,
            chunk_id: c.id,
            chunk_number: c.chunk_index,
            slide_source: slideSource,
            status: "rendering",
            error_msg: null,
          }));
        if (seedRows.length) {
          await supabase.from("video_clips").upsert(seedRows, {
            onConflict: "script_id,chunk_id,slide_source",
          });
        }
        const res = await workerPost(path, { script_id: scriptId, slide_source: slideSource });
        toast.info(`${label}: queued ${res.queued ?? seedRows.length} chunks — rendering…`);
        await pollUntilComplete("video_clips", scriptId, slideSource, label);
      } else {
        const body: any = { script_id: scriptId, slide_source: slideSource };
        const res = await workerPost(path, body);
        toast.success(`${label}: queued ${res.queued ?? ""} chunks`);
      }
      setTimeout(() => refreshAll(scriptId, slideSource), 1500);
    } catch (e: any) { toast.error(`${label} failed: ${e.message}`); }
    finally { setTimeout(() => setBulkBusy(null), 1200); }
  };

  // ── Skip-mode bulk: process only chunks missing the given output.
  // kind picks which map to check and which per-chunk runner to call.
  const skipBulk = async (
    label: string,
    kind: "ocr" | "ts" | "ai" | "clip",
  ) => {
    if (!scriptId) return toast.error("Pick a script first");
    if (!chunks.length) return toast.error("No chunks loaded");
    setBulkBusy(label);
    try {
      const pending = chunks.filter((c) => {
        if (kind === "ocr")  return !ocrMap[c.id];
        if (kind === "ts")   return !tsMap[c.id];
        if (kind === "ai")   return !aiMap[c.id];
        if (kind === "clip") {
          const v = clipMap[c.id];
          return !v || !v.file_url || (v.status && v.status !== "done");
        }
        return false;
      });
      if (!pending.length) {
        toast.info(`${label}: nothing to do — all chunks already have output`);
        return;
      }
      toast.info(`${label}: processing ${pending.length} missing chunk(s)…`);
      let ok = 0, fail = 0;
      for (const c of pending) {
        try {
          if (kind === "ocr") {
            await runOcrFn({ data: { scriptId, chunkId: c.id, chunkNumber: c.chunk_index, slideSource } });
          } else if (kind === "ts") {
            await runTimestamps({ data: { scriptId, chunkId: c.id, chunkNumber: c.chunk_index } });
          } else if (kind === "ai") {
            const { error } = await supabase.functions.invoke("process-annotations", {
              body: {
                script_id: scriptId,
                chunk_id: c.id,
                chunk_number: c.chunk_index,
                slide_source: slideSource
              }
            });
            if (error) throw error;



          } else if (kind === "clip") {
            await workerPost("/clips/render", { script_id: scriptId, chunk_id: c.id, chunk_number: c.chunk_index, slide_source: slideSource });
          }
          ok++;
        } catch (e: any) {
          fail++;
          console.error(`[skipBulk:${kind}] chunk ${c.chunk_index + 1} failed`, e);
        }
      }
      const failMsg = fail ? `, ${fail} failed` : "";
      toast.success(`${label}: ${ok}/${pending.length} done${failMsg}`);
      setTimeout(() => refreshAll(scriptId, slideSource), 1200);
    } catch (e: any) {
      toast.error(`${label} failed: ${e.message}`);
    } finally {
      setTimeout(() => setBulkBusy(null), 1200);
    }
  };


  const deleteAll = async (kind: "ocr" | "ts" | "ai" | "clip") => {
    if (!scriptId) return toast.error("Pick a script first");
    if (!confirm(`Are you sure you want to delete all ${kind} data for this script? This cannot be undone.`)) return;
    
    setBulkBusy(`Deleting ${kind}`);
    try {
      let query;
      if (kind === "ocr") {
        query = supabase.from("ocr_results").delete().eq("script_id", scriptId).eq("slide_source", slideSource);
      } else if (kind === "ts") {
        query = supabase.from("audio_timestamps").delete().eq("script_id", scriptId);
      } else if (kind === "ai") {
        query = supabase.from("clip_annotations").delete().eq("script_id", scriptId).eq("slide_source", slideSource);
      } else if (kind === "clip") {
        query = supabase.from("video_clips").delete().eq("script_id", scriptId).eq("slide_source", slideSource);
      }

      if (kind === "clip") {
        await supabase.from("app_metadata").delete().eq("key", `merge:${scriptId}`);
      }

      if (query) {
        const { error } = await query;
        if (error) throw error;
      }

      toast.success(`Deleted all ${kind} data`);
      await refreshAll(scriptId, slideSource);
    } catch (e: any) {
      toast.error(`Delete failed: ${e.message}`);
    } finally {
      setBulkBusy(null);
    }
  };

  const mergeMega = async () => {
    if (!scriptId) return;
    setBulkBusy("Merge");
    try {
      await workerPost("/merge/run", { script_id: scriptId, slide_source: slideSource });
      toast.success("Merge queued — building mega video");
      setMergeState({ status: "queued" });
    } catch (e: any) { toast.error(`Merge failed: ${e.message}`); }
    finally { setTimeout(() => setBulkBusy(null), 1200); }
  };

  const selectedScript = useMemo(() => scripts.find((s) => s.id === scriptId), [scripts, scriptId]);

  const StatusPill = ({ label, color }: { label: string; color: string }) => (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-${color}-50 text-${color}-700`}>{label}</span>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded uppercase tracking-wider">Phase 6</span>
            <span className="text-[10px] text-slate-400 font-medium tracking-wider">• ANNOTATION PIPELINE</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Annotations</h1>
          <p className="text-slate-500 mt-1 text-sm">OCR → Timestamps → AI Annotations → Render Clips → Merge Mega Video</p>
        </div>
        <Button variant="outline" className="rounded-2xl gap-2 h-10" onClick={() => refreshAll(scriptId, slideSource)}>
          <RefreshCcw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* Script selector */}
      <div className="bg-white rounded-2xl border p-3">
        <Select value={scriptId} onValueChange={setScriptId}>
          <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Select a script…" /></SelectTrigger>
          <SelectContent>
            {scripts.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.title} ({new Date(s.created_at).toLocaleDateString()})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Slide-source toggle + bulk buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {SLIDE_SOURCES.map((s) => (
          <button
            key={s.key}
            onClick={() => setSlideSource(s.key)}
            className={cn(
              "h-10 px-4 rounded-xl text-sm font-semibold border transition-colors",
              slideSource === s.key
                ? `border-${s.color}-500 text-${s.color}-700 bg-${s.color}-50`
                : "border-slate-200 text-slate-500 hover:bg-slate-50",
            )}
          >
            {s.label}
          </button>
        ))}
        <div className="w-px h-8 bg-slate-200 mx-2" />

        {/* OCR */}
        <div className="flex items-center gap-1">
          <Button disabled={!!bulkBusy || !scriptId} onClick={() => bulk("All OCR", "/ocr/run-all")} className="bg-sky-500 hover:bg-sky-600 rounded-xl gap-2 h-10" title="Re-runs OCR on every chunk (overwrites existing).">
            {bulkBusy === "All OCR" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} All OCR
          </Button>
          <Button disabled={!!bulkBusy || !scriptId} onClick={() => skipBulk("Skip & Run OCR", "ocr")} variant="outline" className="border-sky-300 text-sky-700 hover:bg-sky-50 rounded-xl gap-2 h-10" title="Runs OCR only for chunks that don't have OCR yet.">
            {bulkBusy === "Skip & Run OCR" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Skip & Run OCR
          </Button>
          <Button disabled={!!bulkBusy || !scriptId} onClick={() => deleteAll("ocr")} variant="ghost" className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl h-10 w-10 p-0" title="Delete all OCR results">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Timestamps */}
        <div className="flex items-center gap-1">
          <Button disabled={!!bulkBusy || !scriptId} onClick={() => bulk("All Timestamps", "/timestamps/run-all")} className="bg-emerald-500 hover:bg-emerald-600 rounded-xl gap-2 h-10" title="Re-runs ElevenLabs alignment on every chunk (overwrites existing).">
            {bulkBusy === "All Timestamps" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} All Timestamps
          </Button>
          <Button disabled={!!bulkBusy || !scriptId} onClick={() => skipBulk("Skip & Run Timestamps", "ts")} variant="outline" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 rounded-xl gap-2 h-10" title="Runs timestamps only for chunks that don't have them yet.">
            {bulkBusy === "Skip & Run Timestamps" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Skip & Run TS
          </Button>
          <Button disabled={!!bulkBusy || !scriptId} onClick={() => deleteAll("ts")} variant="ghost" className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl h-10 w-10 p-0" title="Delete all timestamps">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Annotations */}
        <div className="flex items-center gap-1">
          <Button disabled={!!bulkBusy || !scriptId} onClick={() => bulk("All Annotations", "/ai/run-all")} className="bg-violet-500 hover:bg-violet-600 rounded-xl gap-2 h-10" title="Re-runs AI annotations on every chunk (overwrites existing).">
            {bulkBusy === "All Annotations" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} All Annotations
          </Button>
          <Button disabled={!!bulkBusy || !scriptId} onClick={() => skipBulk("Skip & Run Annotations", "ai")} variant="outline" className="border-violet-300 text-violet-700 hover:bg-violet-50 rounded-xl gap-2 h-10" title="Runs annotations only for chunks that don't have them yet.">
            {bulkBusy === "Skip & Run Annotations" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Skip & Run AI
          </Button>
          <Button disabled={!!bulkBusy || !scriptId} onClick={() => deleteAll("ai")} variant="ghost" className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl h-10 w-10 p-0" title="Delete all annotations">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Render */}
        <div className="flex items-center gap-1">
          <Button disabled={!!bulkBusy || !scriptId} onClick={() => bulk("Render All", "/clips/render-all")} className="bg-rose-500 hover:bg-rose-600 rounded-xl gap-2 h-10" title="Re-renders every clip (overwrites existing).">
            {bulkBusy === "Render All" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Render All
          </Button>
          <Button disabled={!!bulkBusy || !scriptId} onClick={() => skipBulk("Skip & Render", "clip")} variant="outline" className="border-rose-300 text-rose-700 hover:bg-rose-50 rounded-xl gap-2 h-10" title="Renders only clips that aren't done yet.">
            {bulkBusy === "Skip & Render" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Skip & Render
          </Button>
          <Button disabled={!!bulkBusy || !scriptId} onClick={() => deleteAll("clip")} variant="ghost" className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl h-10 w-10 p-0" title="Delete all renders">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Mega-video banner */}
      <div className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center gap-3">
          <Film className="h-6 w-6" />
          <div>
            <p className="font-bold text-lg">Mega Video</p>
            <p className="text-white/80 text-xs">
              {mergeState.status === "done" && mergeState.url ? `Ready — ${mergeState.clip_count ?? ""} clips merged` :
               mergeState.status === "running" ? "Merging clips with ffmpeg…" :
               mergeState.status === "queued" ? "Queued…" :
               mergeState.status === "error" ? `Error: ${mergeState.error}` :
               "Render all chunks first, then merge into a single YouTube-ready MP4."}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {mergeState.status === "done" && mergeState.url && (
            <div className="flex gap-2">
              <Button 
                onClick={() => window.location.href = `/_dashboard/master-video?script_id=${scriptId}`}
                className="bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl gap-2 h-10 shadow-lg shadow-indigo-500/20"
              >
                <Film className="h-4 w-4" /> Open in Editor
              </Button>
              <a href={mergeState.url} target="_blank" rel="noreferrer">
                <Button className="bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-xl gap-2 h-10 shadow-sm"><Download className="h-4 w-4" /> Download</Button>
              </a>
            </div>
          )}
          <Button onClick={mergeMega} disabled={!!bulkBusy || !scriptId} className={cn("rounded-xl gap-2 h-10 border transition-all", mergeState.status === "done" ? "bg-white/10 text-slate-600 border-slate-200" : "bg-indigo-600 text-white hover:bg-indigo-700 border-transparent shadow-lg shadow-indigo-500/20")}>
            {bulkBusy === "Merge" || mergeState.status === "running" || mergeState.status === "queued"
              ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {mergeState.status === "done" ? "Re-Merge Video" : "Merge Mega Video"}
          </Button>
        </div>

      </div>

      {/* Chunks */}
      <div className="space-y-4">
        {chunks.length === 0 && scriptId && (
          <div className="bg-white rounded-2xl border p-8 text-center text-slate-500 text-sm">No chunks for this script yet.</div>
        )}
        {chunks.map((chunk) => {
          const ocr = ocrMap[chunk.id];
          const ts = tsMap[chunk.id];
          const ai = aiMap[chunk.id];
          const clip = clipMap[chunk.id];

          const ocrWords = ocr?.words ? safeLen(ocr.words) : 0;
          const tsWords = ts?.words ? safeLen(ts.words) : 0;
          const aiCount = ai?.annotations ? safeLen(ai.annotations) : 0;

          const slideImgUrl = getSlidePreviewUrl(chunk, slideSource);
          const ocrRaw = parseOcrRaw(ocr?.words);
          const tsRaw = parseTsRaw(ts?.words);
          const aiText = parseAnnotationsText(ai?.annotations);
          const aiRaw = parseAnnotationsRaw(ai?.annotations);

          return (
            <div key={chunk.id} className="bg-white rounded-2xl border shadow-sm overflow-hidden">
              {/* row header */}
              <div className="flex items-center justify-between px-5 py-3 border-b bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-700 font-bold flex items-center justify-center text-sm">{chunk.chunk_index}</div>
                  <p className="font-bold text-slate-800">Chunk {String((Number(chunk.chunk_index) || 0) + 1).padStart(3, "0")}</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  {ocrWords > 0 && <StatusPill label={`OCR ${ocrWords}`} color="sky" />}
                  {tsWords > 0 && <StatusPill label={`TS ${tsWords}`} color="emerald" />}
                  {aiCount > 0 && <StatusPill label={`AI ${aiCount}`} color="violet" />}
                  {clip?.status === "done" && <StatusPill label="CLIP" color="rose" />}
                </div>
              </div>

              {/* Row 1: Original Script · Slide · OCR */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 px-5 pt-4">
                <Tile 
                  label="Original Script" 
                  color="slate"
                  action={
                    <div className="flex gap-1">
                      {editingId === chunk.id ? (
                        <>
                          <ActionBtn 
                            color="rose" 
                            busy={false} 
                            onClick={() => setEditingId(null)} 
                            label="Cancel" 
                          />
                          <ActionBtn 
                            color="emerald" 
                            busy={isSaving} 
                            onClick={() => handleSaveChunk(chunk)} 
                            label="Save" 
                          />
                        </>
                      ) : (
                        <ActionBtn 
                          color="sky" 
                          busy={false} 
                          onClick={() => {
                            setEditingId(chunk.id);
                            setEditDraft(chunk.content || "");
                          }} 
                          label="Edit" 
                        />
                      )}
                    </div>
                  }
                >
                  {editingId === chunk.id ? (
                    <Textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      className="text-xs min-h-[120px] p-2"
                    />
                  ) : (
                    <p className="text-xs text-slate-600 line-clamp-6 leading-relaxed whitespace-pre-wrap">{chunk.content}</p>
                  )}
                </Tile>

                <Tile label={`Slide · ${slideSource.toUpperCase()}`} color="amber">
                  <div className="rounded-md border bg-slate-100 aspect-video overflow-hidden flex items-center justify-center">
                    {slideImgUrl ? (
                      <img src={slideImgUrl} alt="" className="w-full h-full object-contain" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                    ) : (
                      <FileImage className="h-8 w-8 text-slate-300" />
                    )}
                  </div>
                </Tile>

                <Tile
                  label="OCR Output"
                  color="sky"
                  icon={<Type className="h-3.5 w-3.5" />}
                  action={
                    <ActionBtn
                      color="sky"
                      busy={!!busy[`ocr:${chunk.id}`]}
                      onClick={() => runOcr(chunk)}
                      label={ocr ? "Regenerate" : "Generate"}
                    />
                  }
                >
                  {ocr ? (
                    <RawBlock
                      lines={ocrRaw}
                      expanded={!!expanded[`ocr:${chunk.id}`]}
                      onToggle={() => toggleExp(`ocr:${chunk.id}`)}
                      emptyLabel={`${ocrWords} words`}
                      mono
                    />
                  ) : (
                    <p className="text-xs text-slate-400 italic">No OCR yet</p>
                  )}
                </Tile>
              </div>

              {/* Row 2: Timestamps · Annotations · Clip */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 px-5 py-4">
                <Tile
                  label="Timestamps"
                  color="emerald"
                  icon={<Clock className="h-3.5 w-3.5" />}
                  action={
                    <ActionBtn
                      color="emerald"
                      busy={!!busy[`ts:${chunk.id}`]}
                      onClick={() => runTs(chunk)}
                      label={ts ? "Regenerate" : "Generate"}
                    />
                  }
                >
                  {ts ? (
                    <RawBlock
                      lines={tsRaw}
                      expanded={!!expanded[`ts:${chunk.id}`]}
                      onToggle={() => toggleExp(`ts:${chunk.id}`)}
                      emptyLabel={`${tsWords} words`}
                      mono
                    />
                  ) : (
                    <p className="text-xs text-slate-400 italic">No timestamps yet</p>
                  )}
                </Tile>

                <Tile
                  label="Annotations"
                  color="violet"
                  icon={<Sparkles className="h-3.5 w-3.5" />}
                  action={
                    <ActionBtn
                      color="violet"
                      busy={!!busy[`ai:${chunk.id}`]}
                      onClick={() => runAi(chunk)}
                      disabled={!ocr || !ts}
                      label={ai ? "Regenerate" : "Generate"}
                    />
                  }
                >
                  {ai ? (
                    <RawBlock
                      lines={(expanded[`ai:${chunk.id}`] ? aiRaw : aiText.split("\n")).filter(Boolean)}
                      expanded={!!expanded[`ai:${chunk.id}`]}
                      onToggle={() => toggleExp(`ai:${chunk.id}`)}
                      emptyLabel={`${aiCount} annotations`}
                      mono={!!expanded[`ai:${chunk.id}`]}
                    />
                  ) : (
                    <p className="text-xs text-slate-400 italic">{ocr && ts ? "Ready to run" : "Run OCR + TS first"}</p>
                  )}
                </Tile>

                <Tile
                  label="Final Clip"
                  color="rose"
                  icon={<Film className="h-3.5 w-3.5" />}
                  action={
                    <ActionBtn
                      color="rose"
                      busy={!!busy[`clip:${chunk.id}`] || clip?.status === "rendering"}
                      onClick={() => renderClip(chunk)}
                      disabled={!ai}
                      label={clip ? "Re-render" : "Generate"}
                    />
                  }
                >
                  <div className="rounded-md border bg-slate-900 aspect-video overflow-hidden flex items-center justify-center">
                    {clip?.file_url && clip?.status === "done" ? (
                      <video src={clip.file_url} controls className="w-full h-full" />
                    ) : clip?.status === "rendering" ? (
                      <span className="text-[11px] text-amber-300 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> rendering…</span>
                    ) : clip?.status === "error" ? (
                      <span className="text-[11px] text-rose-300 px-2 text-center"><AlertCircle className="h-3 w-3 inline mr-1" />{clip.error_msg?.slice(0, 60)}</span>
                    ) : (
                      <Film className="h-8 w-8 text-slate-600" />
                    )}
                  </div>
                  {clip?.status === "done" && clip.duration && (
                    <p className="text-[10px] text-emerald-600 text-center mt-1 flex items-center justify-center gap-1"><CheckCircle2 className="h-3 w-3" />{clip.duration.toFixed(1)}s</p>
                  )}
                </Tile>
              </div>
            </div>
          );
        })}
      </div>

      {selectedScript && (
        <p className="text-xs text-slate-400 text-center pt-2">Worker: {ANNOTATIONS_WORKER_URL.replace("https://", "")}</p>
      )}
    </div>
  );
}

function safeLen(v: any): number {
  try {
    const arr = typeof v === "string" ? JSON.parse(v) : v;
    return Array.isArray(arr) ? arr.length : 0;
  } catch { return 0; }
}

function parseWordsText(v: any): string {
  try {
    const arr = typeof v === "string" ? JSON.parse(v) : v;
    if (!Array.isArray(arr)) return "";
    return arr.map((w: any) => (typeof w === "string" ? w : w?.text ?? w?.word ?? "")).filter(Boolean).join(" ");
  } catch { return ""; }
}

/** OCR raw rows:  "TEXT  [x,y w×h] conf%" */
function parseOcrRaw(v: any): string[] {
  try {
    const arr = typeof v === "string" ? JSON.parse(v) : v;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((w: any) => {
        if (typeof w === "string") return w;
        const txt = (w?.text ?? w?.word ?? "").toString();
        if (!txt) return "";
        const x = w?.x ?? w?.left;
        const y = w?.y ?? w?.top;
        const ww = w?.w ?? w?.width;
        const hh = w?.h ?? w?.height;
        const conf = w?.conf ?? w?.confidence;
        const coord = x != null && y != null ? `[${x},${y}${ww != null && hh != null ? ` ${ww}×${hh}` : ""}]` : "";
        const c = conf != null ? `  ${typeof conf === "number" ? conf.toFixed(0) : conf}%` : "";
        return `${txt.padEnd(24, " ")} ${coord}${c}`;
      })
      .filter(Boolean);
  } catch { return []; }
}

/** Timestamp raw rows:  "  12.34s →  12.78s   word   (original)" */
function parseTsRaw(v: any): string[] {
  try {
    const arr = typeof v === "string" ? JSON.parse(v) : v;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((w: any) => {
        if (typeof w === "string") return w;
        const word = (w?.word ?? w?.text ?? "").toString();
        if (!word) return "";
        const s = w?.start;
        const e = w?.end;
        const orig = w?.original && w.original !== word ? `   (${w.original})` : "";
        const fmt = (t: any) => (typeof t === "number" ? `${t.toFixed(2).padStart(7, " ")}s` : "       ");
        return `${fmt(s)} → ${fmt(e)}   ${word}${orig}`;
      })
      .filter(Boolean);
  } catch { return []; }
}

/** Annotations raw rows: JSON-stringified entries, one per line. */
function parseAnnotationsRaw(v: any): string[] {
  try {
    const arr = typeof v === "string" ? JSON.parse(v) : v;
    if (!Array.isArray(arr)) return [];
    return arr.map((a: any, i: number) => `${String(i + 1).padStart(2, " ")}. ${JSON.stringify(a)}`);
  } catch { return []; }
}

function RawBlock({
  lines, expanded, onToggle, emptyLabel, mono,
}: {
  lines: string[];
  expanded: boolean;
  onToggle: () => void;
  emptyLabel?: string;
  mono?: boolean;
}) {
  if (!lines.length) {
    return <p className="text-xs text-slate-400 italic">{emptyLabel || "—"}</p>;
  }
  const shown = expanded ? lines : lines.slice(0, 6);
  return (
    <div className="space-y-1">
      <pre
        className={cn(
          "text-[11px] text-slate-700 whitespace-pre leading-relaxed overflow-x-auto",
          expanded ? "max-h-72 overflow-y-auto pr-1" : "",
          mono ? "font-mono" : "font-sans",
        )}
      >
        {shown.join("\n")}
      </pre>
      {lines.length > 6 && (
        <button
          type="button"
          onClick={onToggle}
          className="text-[11px] text-slate-500 hover:text-slate-800 underline underline-offset-2"
        >
          {expanded ? "Show less" : `Show all ${lines.length} rows`}
        </button>
      )}
    </div>
  );
}


function parseAnnotationsText(v: any): string {
  try {
    const arr = typeof v === "string" ? JSON.parse(v) : v;
    if (!Array.isArray(arr)) return "";
    return arr.map((a: any, i: number) => {
      const t = a?.text ?? a?.label ?? a?.annotation ?? JSON.stringify(a);
      return `${i + 1}. ${t}`;
    }).join("\n");
  } catch { return ""; }
}

function getSlidePreviewUrl(chunk: any, source: SlideSource): string | null {
  // Prefer cached preview URL embedded in annotations payload (used by /slides page).
  const ann = chunk?.annotations;
  if (ann && typeof ann === "object") {
    const srcAnn = (ann as any)[source];
    if (srcAnn?.preview_url) return srcAnn.preview_url;
  }
  // Fall back to the slide PNG the worker downloaded into the `slides` bucket.
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!base || !chunk?.script_id) return chunk?.slide_url || null;
  const n = String((Number(chunk.chunk_index) || 0) + 1).padStart(3, "0");
  return `${base}/storage/v1/object/public/slides/${chunk.script_id}/slide_${n}.png`;
}

function Tile({
  label, color, icon, action, children,
}: {
  label: string;
  color: "slate" | "sky" | "emerald" | "violet" | "rose" | "amber";
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ring: Record<string, string> = {
    slate: "border-slate-200 bg-slate-50/40",
    sky: "border-sky-200 bg-sky-50/40",
    emerald: "border-emerald-200 bg-emerald-50/40",
    violet: "border-violet-200 bg-violet-50/40",
    rose: "border-rose-200 bg-rose-50/40",
    amber: "border-amber-200 bg-amber-50/40",
  };
  const head: Record<string, string> = {
    slate: "text-slate-500",
    sky: "text-sky-700",
    emerald: "text-emerald-700",
    violet: "text-violet-700",
    rose: "text-rose-700",
    amber: "text-amber-700",
  };
  return (
    <div className={cn("rounded-xl border p-2.5 flex flex-col gap-2", ring[color])}>
      <div className="flex items-center justify-between gap-2">
        <div className={cn("flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider", head[color])}>
          {icon}{label}
        </div>
      </div>
      {action}
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

function ActionBtn({
  color, busy, onClick, disabled, label,
}: {
  color: "sky" | "emerald" | "violet" | "rose";
  busy: boolean;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  const btn: Record<string, string> = {
    sky: "bg-sky-500 hover:bg-sky-600",
    emerald: "bg-emerald-500 hover:bg-emerald-600",
    violet: "bg-violet-500 hover:bg-violet-600",
    rose: "bg-rose-500 hover:bg-rose-600",
  };
  return (
    <Button
      onClick={onClick}
      disabled={busy || disabled}
      className={cn("w-full rounded-lg gap-1.5 h-8 text-[11px] text-white", btn[color], disabled && "opacity-50")}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
      {busy ? "Running…" : label}
    </Button>
  );
}
