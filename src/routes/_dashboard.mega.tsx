/**
 * MEGA PAGE — single-screen pipeline: pick a finished script and orchestrate
 * the full Chunks → Audio → Slides → OCR → Timestamps → Annotations → Render
 * flow without leaving the page. RUN ALL runs the pipeline end-to-end.
 *
 * This page is purely additive — it reuses the same server fns and edge
 * functions the dedicated pages use. No existing wiring is altered.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Rocket, Loader2, Pencil, Save, X, RefreshCcw, Mic2, FileVideo,
  ScanText, Clock, Sparkles, Film, Scissors, Play, Download,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { saveChunks, updateChunk, updateScript } from "@/lib/engine.functions";
import { processChunks } from "@/lib/api/process-chunks.functions";
import { runOcrAll as runOcrAllFn } from "@/lib/ocr.functions";
import { runTimestampsAll } from "@/lib/timestamps.functions";
import { ANNOTATIONS_WORKER_URL } from "@/lib/worker";

export const Route = createFileRoute("/_dashboard/mega")({
  component: MegaPage,
});

type SlideSource = "gamma" | "dalle" | "replit";

const GAMMA_THEMES = [
  "Oasis", "Aurora", "Night Sky", "Bubble Gum", "Marina", "Stargazer",
  "Sketch", "Sleek", "Sapphire", "Vintage", "Mint", "Mocha", "Sunset",
];

const PROVIDERS = [
  { value: "cartesia", label: "Cartesia" },
  { value: "elevenlabs", label: "ElevenLabs" },
  { value: "google", label: "Google AI Studio" },
];

const CARTESIA_MODELS = ["sonic-3-latest", "sonic-3", "sonic-2", "sonic-turbo"];
const ELEVENLABS_MODELS = ["eleven_v3", "eleven_multilingual_v2", "eleven_turbo_v2_5", "eleven_flash_v2_5"];
const GOOGLE_MODELS = ["gemini-2.5-pro-preview-tts", "gemini-2.5-flash-preview-tts"];

async function workerPost(path: string, body: any) {
  const res = await fetch(`${ANNOTATIONS_WORKER_URL}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) throw new Error(json?.detail || text || `HTTP ${res.status}`);
  return json;
}

function MegaPage() {
  const processChunksFn = useServerFn(processChunks);
  const saveChunksFn = useServerFn(saveChunks);
  const updateChunkFn = useServerFn(updateChunk);
  const updateScriptFn = useServerFn(updateScript);

  // ── script + chunks
  const [scripts, setScripts] = useState<any[]>([]);
  const [scriptId, setScriptId] = useState<string>("");
  const [scriptDraft, setScriptDraft] = useState<string>("");
  const [scriptSaving, setScriptSaving] = useState(false);
  const [chunks, setChunks] = useState<any[]>([]);
  const [targetWords, setTargetWords] = useState<number>(180);
  const [generatingChunks, setGeneratingChunks] = useState(false);

  // ── modality settings
  const [slideSource, setSlideSource] = useState<SlideSource>("gamma");
  const [gammaTheme, setGammaTheme] = useState<string>("Oasis");
  const [audioProvider, setAudioProvider] = useState<string>("cartesia");
  const [audioModel, setAudioModel] = useState<string>("sonic-3-latest");
  const [voiceId, setVoiceId] = useState<string>("4987882a-488c-480a-ace8-f1127032a83b");

  useEffect(() => {
    if (audioProvider === "elevenlabs") { setVoiceId("UusdT1frXE5G4cvEE2dJ"); setAudioModel("eleven_v3"); }
    else if (audioProvider === "google") { setVoiceId("Charon"); setAudioModel("gemini-2.5-pro-preview-tts"); }
    else { setVoiceId("4987882a-488c-480a-ace8-f1127032a83b"); setAudioModel("sonic-3-latest"); }
  }, [audioProvider]);

  // ── pipeline status maps
  const [ocrMap, setOcrMap] = useState<Record<string, any>>({});
  const [tsMap, setTsMap] = useState<Record<string, any>>({});
  const [aiMap, setAiMap] = useState<Record<string, any>>({});
  const [clipMap, setClipMap] = useState<Record<string, any>>({});

  // ── busy state
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{
    title: string; message: string; onConfirm: () => void;
  } | null>(null);
  const scriptIdRef = useRef(scriptId);
  const slideSourceRef = useRef(slideSource);
  useEffect(() => { scriptIdRef.current = scriptId; }, [scriptId]);
  useEffect(() => { slideSourceRef.current = slideSource; }, [slideSource]);

  // ── fetch finished scripts
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("scripts")
        .select("id,title,content,created_at,status")
        .eq("status", "SCRIPT_DONE")
        .not("content", "is", null)
        .order("created_at", { ascending: false })
        .limit(50);
      setScripts(data || []);
    })();
  }, []);

  // ── on script change, load preview content + chunks + pipeline state
  useEffect(() => {
    if (!scriptId) {
      setScriptDraft(""); setChunks([]); setOcrMap({}); setTsMap({}); setAiMap({}); setClipMap({});
      return;
    }
    refreshAll(scriptId, slideSource);
  }, [scriptId, slideSource]);

  // ── auto-poll while pipeline is active
  useEffect(() => {
    if (!scriptId) return;
    const audioActive = chunks.some(c => c.audio_job_status === "queued" || c.audio_job_status === "processing");
    const slideActive = chunks.some(c => c.slide_job_status === "queued" || c.slide_job_status === "processing");
    const renderActive = Object.values(clipMap).some((c: any) => c?.status === "rendering" || c?.status === "pending");
    if (!audioActive && !slideActive && !renderActive && !bulkBusy) return;
    const t = setInterval(() => refreshAll(scriptId, slideSource), 4000);
    return () => clearInterval(t);
  }, [scriptId, slideSource, chunks, clipMap, bulkBusy]);

  const refreshAll = async (sid: string, src: SlideSource) => {
    if (!sid) return;
    const [scriptRow, c, o, t, a, v] = await Promise.all([
      supabase.from("scripts").select("content").eq("id", sid).maybeSingle(),
      supabase.from("script_chunks").select("*").eq("script_id", sid).order("chunk_index"),
      supabase.from("ocr_results").select("*").eq("script_id", sid).eq("slide_source", src),
      supabase.from("audio_timestamps").select("*").eq("script_id", sid),
      supabase.from("clip_annotations").select("*").eq("script_id", sid).eq("slide_source", src),
      supabase.from("video_clips").select("*").eq("script_id", sid).eq("slide_source", src),
    ]);
    if (scriptRow.data?.content !== undefined) setScriptDraft(scriptRow.data.content || "");
    setChunks(c.data || []);
    setOcrMap(Object.fromEntries((o.data || []).map((r: any) => [r.chunk_id, r])));
    setTsMap(Object.fromEntries((t.data || []).map((r: any) => [r.chunk_id, r])));
    setAiMap(Object.fromEntries((a.data || []).map((r: any) => [r.chunk_id, r])));
    setClipMap(Object.fromEntries((v.data || []).map((r: any) => [r.chunk_id, r])));
  };

  // ── script preview autosave (debounced)
  const scriptSaveTimer = useRef<any>(null);
  const onScriptDraftChange = (v: string) => {
    setScriptDraft(v);
    if (!scriptId) return;
    if (scriptSaveTimer.current) clearTimeout(scriptSaveTimer.current);
    scriptSaveTimer.current = setTimeout(async () => {
      setScriptSaving(true);
      try { await updateScriptFn({ data: { id: scriptId, content: v } }); }
      catch (e: any) { toast.error("Autosave failed: " + e.message); }
      finally { setScriptSaving(false); }
    }, 1200);
  };

  // ── chunk generation
  const generateChunksAction = async () => {
    if (!scriptId) return toast.error("Pick a script first");
    setGeneratingChunks(true);
    try {
      const content = scriptDraft || scripts.find(s => s.id === scriptId)?.content || "";
      const res = await processChunksFn({ data: { scriptContent: content, targetWords } });
      await saveChunksFn({ data: { script_id: scriptId, chunks: res.chunks } });
      toast.success(`Generated & saved ${res.chunks.length} chunks`);
      await refreshAll(scriptId, slideSource);
    } catch (e: any) {
      toast.error("Chunking failed: " + e.message);
    } finally { setGeneratingChunks(false); }
  };

  // ── bulk actions (audio + slides queue via process-queue; OCR/TS/AI/render via worker+fns)
  const generateAllAudio = async (force = false) => {
    if (!scriptId || chunks.length === 0) return;
    setBulkBusy("All Audios");
    try {
      const eligibleIds = chunks
        .filter(c => (force || !c.audio_url) && c.audio_job_status !== "processing")
        .map(c => c.id);
      if (eligibleIds.length === 0) { toast.info("Nothing to queue"); return; }
      const { error } = await supabase.from("script_chunks").update({
        audio_job_status: "queued",
        audio_job_provider: audioProvider,
        audio_job_voice_id: voiceId,
        audio_job_model: audioModel,
        audio_job_error: null,
        ...(force ? { audio_url: null } : {}),
      }).in("id", eligibleIds);
      if (error) throw error;
      supabase.functions.invoke("process-queue", { body: { scriptId } }).catch(() => {});
      toast.success(`Queued ${eligibleIds.length} audio clips`);
      await refreshAll(scriptId, slideSource);
      await pollUntilField("audio", "All Audios");
    } catch (e: any) { toast.error("Audio queue failed: " + e.message); }
    finally { setBulkBusy(null); }
  };

  const generateAllSlides = async () => {
    if (!scriptId || chunks.length === 0) return;
    setBulkBusy("All Slides");
    try {
      // 1) ensure outlines exist (prompt) sequentially via edge fn
      for (const c of chunks) {
        if (!c.slide_prompt) {
          await supabase.functions.invoke("generate-slides", {
            body: { chunkId: c.id, action: "generate-prompt" },
          });
        }
      }
      await refreshAll(scriptId, slideSource);
      // 2) queue all slides
      const fresh = (await supabase.from("script_chunks").select("*").eq("script_id", scriptId).order("chunk_index")).data || [];
      const eligibleIds = fresh.filter((c: any) => c.slide_prompt && c.slide_job_status !== "processing").map((c: any) => c.id);
      if (eligibleIds.length === 0) { toast.info("Nothing to queue for slides"); return; }
      const { error } = await supabase.from("script_chunks").update({
        slide_job_status: "queued", slide_job_theme: gammaTheme, slide_job_error: null,
      }).in("id", eligibleIds);
      if (error) throw error;
      supabase.functions.invoke("process-queue", { body: { scriptId } }).catch(() => {});
      toast.success(`Queued ${eligibleIds.length} slides`);
      await refreshAll(scriptId, slideSource);
      await pollUntilField("slide", "All Slides");
    } catch (e: any) { toast.error("Slides queue failed: " + e.message); }
    finally { setBulkBusy(null); }
  };

  // poll until every chunk has audio_url / slide_url
  const pollUntilField = async (kind: "audio" | "slide", label: string) => {
    const MAX_MS = 30 * 60_000;
    const started = Date.now();
    while (Date.now() - started < MAX_MS) {
      await new Promise(r => setTimeout(r, 4000));
      if (scriptIdRef.current !== scriptId) return;
      const { data } = await supabase.from("script_chunks").select("*").eq("script_id", scriptId).order("chunk_index");
      setChunks(data || []);
      const total = data?.length || 0;
      const done = (data || []).filter((c: any) =>
        kind === "audio" ? !!c.audio_url : !!c.slide_url
      ).length;
      if (total && done >= total) { toast.success(`${label}: ${done}/${total} ready`); return; }
    }
    toast.warning(`${label}: timed out — check status`);
  };

  const pollUntilTable = async (
    table: "audio_timestamps" | "ocr_results" | "video_clips",
    label: string,
  ) => {
    const sid = scriptId; const src = slideSource;
    const total = chunks.length || (await supabase.from("script_chunks").select("id", { count: "exact", head: true }).eq("script_id", sid)).count || 0;
    if (!total) return;
    const MAX_MS = 30 * 60_000;
    const started = Date.now();
    while (Date.now() - started < MAX_MS) {
      await new Promise(r => setTimeout(r, 4000));
      if (scriptIdRef.current !== sid || slideSourceRef.current !== src) return;
      let count = 0;
      if (table === "ocr_results") {
        const { count: cnt } = await supabase.from("ocr_results").select("chunk_id", { count: "exact", head: true }).eq("script_id", sid).eq("slide_source", src);
        count = cnt || 0;
      } else if (table === "audio_timestamps") {
        const { count: cnt } = await supabase.from("audio_timestamps").select("chunk_id", { count: "exact", head: true }).eq("script_id", sid);
        count = cnt || 0;
      } else {
        const { count: cnt } = await supabase.from("video_clips").select("chunk_id", { count: "exact", head: true }).eq("script_id", sid).eq("slide_source", src).eq("status", "done");
        count = cnt || 0;
      }
      await refreshAll(sid, src);
      if (count >= total) { toast.success(`${label}: ${count}/${total} done`); return; }
    }
    toast.warning(`${label}: timed out`);
  };

  const runAllOcr = async () => {
    if (!scriptId) return;
    setBulkBusy("All OCR");
    try {
      const res: any = await runOcrAllFn({ data: { scriptId, slideSource } });
      toast.info(`OCR queued ${res.queued} chunks…`);
      await pollUntilTable("ocr_results", "All OCR");
    } catch (e: any) { toast.error("OCR failed: " + e.message); }
    finally { setBulkBusy(null); }
  };

  const runAllTimestamps = async () => {
    if (!scriptId) return;
    setBulkBusy("All Timestamps");
    try {
      const res: any = await runTimestampsAll({ data: { scriptId } });
      toast.info(`Timestamps queued ${res.queued} chunks…`);
      await pollUntilTable("audio_timestamps", "All Timestamps");
    } catch (e: any) { toast.error("Timestamps failed: " + e.message); }
    finally { setBulkBusy(null); }
  };

  const runAllAnnotations = async () => {
    if (!scriptId || chunks.length === 0) return;
    setBulkBusy("All Annotations");
    try {
      await Promise.all(chunks.map(c =>
        supabase.functions.invoke("process-annotations", {
          body: { script_id: scriptId, chunk_id: c.id, chunk_number: c.chunk_index, slide_source: slideSource },
        })
      ));
      toast.success("All annotations done");
      await refreshAll(scriptId, slideSource);
    } catch (e: any) { toast.error("Annotations failed: " + e.message); }
    finally { setBulkBusy(null); }
  };

  const renderAll = async () => {
    if (!scriptId) return;
    setBulkBusy("Render All");
    try {
      const seedRows = chunks
        .filter(c => !!aiMap[c.id])
        .map(c => ({
          script_id: scriptId, chunk_id: c.id, chunk_number: c.chunk_index,
          slide_source: slideSource, status: "rendering", error_msg: null,
        }));
      if (seedRows.length) {
        await supabase.from("video_clips").upsert(seedRows, { onConflict: "script_id,chunk_id,slide_source" });
      }
      const res = await workerPost("/clips/render-all", { script_id: scriptId, slide_source: slideSource });
      toast.info(`Render queued ${res.queued ?? seedRows.length} chunks…`);
      await refreshAll(scriptId, slideSource);
      await pollUntilTable("video_clips", "Render All");
    } catch (e: any) { toast.error("Render failed: " + e.message); }
    finally { setBulkBusy(null); }
  };

  // ── RUN ALL pipeline: Audio → Slides → OCR → Timestamps → Annotations → Render
  const runAllPipeline = async () => {
    if (!scriptId) return toast.error("Pick a script first");
    setBulkBusy("AUTO PIPELINE");
    const steps: Array<{ label: string; fn: () => Promise<void> }> = [
      { label: "Audios", fn: generateAllAudio },
      { label: "Slides", fn: generateAllSlides },
      { label: "OCR", fn: runAllOcr },
      { label: "Timestamps", fn: runAllTimestamps },
      { label: "Annotations", fn: runAllAnnotations },
      { label: "Render", fn: renderAll },
    ];
    try {
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        toast.info(`AUTO PIPELINE [${i + 1}/${steps.length}]: ${s.label}…`);
        // each fn manages its own bulkBusy; clear so it can re-set
        setBulkBusy(`AUTO • ${s.label}`);
        await s.fn();
        await refreshAll(scriptId, slideSource);
      }
      toast.success("✨ AUTO PIPELINE complete — review previews below.");
    } catch (e: any) {
      toast.error(`AUTO PIPELINE stopped: ${e.message}`);
    } finally {
      setBulkBusy(null);
    }
  };

  const selectedScript = useMemo(() => scripts.find(s => s.id === scriptId), [scripts, scriptId]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded uppercase tracking-wider">MEGA</span>
            <span className="text-[10px] text-slate-400 font-medium tracking-wider">• ONE-CLICK PIPELINE</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Rocket className="h-7 w-7 text-purple-600" /> Mega Page
          </h1>
          <p className="text-slate-500 text-sm mt-1">Pick a script and run Chunks → Audio → Slides → OCR → Timestamps → Annotations → Render in one go.</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => refreshAll(scriptId, slideSource)}>
          <RefreshCcw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* Script selector */}
      <Card>
        <CardContent className="p-4 md:p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <Label className="md:w-32 text-sm font-bold">Select Script</Label>
            <Select value={scriptId} onValueChange={setScriptId}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="Pick a finished script…" /></SelectTrigger>
              <SelectContent>
                {scripts.length ? scripts.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                )) : <SelectItem value="none" disabled>No finished scripts found</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          {scriptId && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase text-slate-500">Script Preview {scriptSaving && <span className="ml-2 text-purple-500">(autosaving…)</span>}</Label>
                <span className="text-[10px] text-slate-400">Edit inline — autosaves after 1.2s</span>
              </div>
              <Textarea
                value={scriptDraft}
                onChange={e => onScriptDraftChange(e.target.value)}
                className="min-h-[160px] text-sm font-telugu"
                placeholder="Script content…"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chunks generator */}
      <Card>
        <CardContent className="p-4 md:p-6 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Label className="md:w-32 text-sm font-bold flex items-center gap-2"><Scissors className="h-4 w-4" /> Chunks</Label>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setTargetWords(Math.max(80, targetWords - 5))}>−</Button>
              <Input type="number" value={targetWords} onChange={e => setTargetWords(Math.max(80, Math.min(300, parseInt(e.target.value || "0") || 180)))} className="w-24 text-center" />
              <Button size="sm" variant="outline" onClick={() => setTargetWords(Math.min(300, targetWords + 5))}>+</Button>
              <span className="text-xs text-slate-500">words/chunk</span>
            </div>
            <Button onClick={generateChunksAction} disabled={generatingChunks || !scriptId} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
              {generatingChunks ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
              Generate Chunks
            </Button>
            <span className="text-xs text-slate-500 ml-auto">{chunks.length} chunks loaded</span>
          </div>
        </CardContent>
      </Card>

      {/* All buttons row with model selectors */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-500">All Buttons</CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Slides */}
            <div className="rounded-xl border p-3 space-y-2 bg-rose-50/40">
              <div className="flex items-center gap-2 text-rose-700 font-bold text-xs uppercase">
                <FileVideo className="h-4 w-4" /> All Slides
              </div>
              <Select value={slideSource} onValueChange={(v: SlideSource) => setSlideSource(v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gamma">Gamma</SelectItem>
                  <SelectItem value="dalle">DALL·E</SelectItem>
                  <SelectItem value="replit">Replit</SelectItem>
                </SelectContent>
              </Select>
              {slideSource === "gamma" && (
                <Select value={gammaTheme} onValueChange={setGammaTheme}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{GAMMA_THEMES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              )}
              <Button size="sm" className="w-full bg-rose-600 hover:bg-rose-700 gap-2" disabled={!!bulkBusy || !scriptId || !chunks.length} onClick={generateAllSlides}>
                {bulkBusy === "All Slides" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Run
              </Button>
            </div>

            {/* Audios */}
            <div className="rounded-xl border p-3 space-y-2 bg-blue-50/40">
              <div className="flex items-center gap-2 text-blue-700 font-bold text-xs uppercase">
                <Mic2 className="h-4 w-4" /> All Audios
              </div>
              <Select value={audioProvider} onValueChange={setAudioProvider}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{PROVIDERS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={audioModel} onValueChange={setAudioModel}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(audioProvider === "google" ? GOOGLE_MODELS : audioProvider === "elevenlabs" ? ELEVENLABS_MODELS : CARTESIA_MODELS)
                    .map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input className="h-8 text-xs" placeholder="Voice ID" value={voiceId} onChange={e => setVoiceId(e.target.value)} />
              <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700 gap-2" disabled={!!bulkBusy || !scriptId || !chunks.length} onClick={generateAllAudio}>
                {bulkBusy === "All Audios" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Run
              </Button>
            </div>

            {/* OCR */}
            <div className="rounded-xl border p-3 space-y-2 bg-amber-50/40">
              <div className="flex items-center gap-2 text-amber-700 font-bold text-xs uppercase">
                <ScanText className="h-4 w-4" /> All OCR
              </div>
              <p className="text-[10px] text-slate-500">Google Vision on {slideSource} slides.</p>
              <Button size="sm" className="w-full bg-amber-600 hover:bg-amber-700 gap-2" disabled={!!bulkBusy || !scriptId || !chunks.length} onClick={runAllOcr}>
                {bulkBusy === "All OCR" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Run
              </Button>
            </div>

            {/* Timestamps */}
            <div className="rounded-xl border p-3 space-y-2 bg-emerald-50/40">
              <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs uppercase">
                <Clock className="h-4 w-4" /> All Timestamps
              </div>
              <p className="text-[10px] text-slate-500">Whisper word-level on audio.</p>
              <Button size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2" disabled={!!bulkBusy || !scriptId || !chunks.length} onClick={runAllTimestamps}>
                {bulkBusy === "All Timestamps" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Run
              </Button>
            </div>

            {/* Annotations */}
            <div className="rounded-xl border p-3 space-y-2 bg-violet-50/40">
              <div className="flex items-center gap-2 text-violet-700 font-bold text-xs uppercase">
                <Sparkles className="h-4 w-4" /> All Annotations
              </div>
              <p className="text-[10px] text-slate-500">GPT-4o aligns OCR ↔ timestamps.</p>
              <Button size="sm" className="w-full bg-violet-600 hover:bg-violet-700 gap-2" disabled={!!bulkBusy || !scriptId || !chunks.length} onClick={runAllAnnotations}>
                {bulkBusy === "All Annotations" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Run
              </Button>
            </div>

            {/* Render */}
            <div className="rounded-xl border p-3 space-y-2 bg-fuchsia-50/40">
              <div className="flex items-center gap-2 text-fuchsia-700 font-bold text-xs uppercase">
                <Film className="h-4 w-4" /> Render All
              </div>
              <p className="text-[10px] text-slate-500">Build per-chunk video clips.</p>
              <Button size="sm" className="w-full bg-fuchsia-600 hover:bg-fuchsia-700 gap-2" disabled={!!bulkBusy || !scriptId || !chunks.length} onClick={renderAll}>
                {bulkBusy === "Render All" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Run
              </Button>
            </div>
          </div>

          {/* RUN ALL */}
          <div className="border-t pt-4 flex flex-col md:flex-row items-stretch md:items-center gap-3">
            <p className="text-xs text-slate-500 flex-1">
              <span className="font-bold">AUTO PIPELINE:</span> Audios → Slides → OCR → Timestamps → Annotations → Render. Uses the model selections above. Mega-video merge stays manual.
            </p>
            <Button
              size="lg"
              disabled={!!bulkBusy || !scriptId || !chunks.length}
              onClick={runAllPipeline}
              className="bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-700 hover:to-fuchsia-700 text-white font-bold shadow-lg shadow-purple-200 gap-2 h-12 px-8"
            >
              {bulkBusy?.startsWith("AUTO") ? <Loader2 className="h-5 w-5 animate-spin" /> : <Rocket className="h-5 w-5" />}
              {bulkBusy?.startsWith("AUTO") ? bulkBusy : "RUN ALL"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Per-chunk preview grid */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Chunks & Previews</h2>
        {chunks.length === 0 ? (
          <Card><CardContent className="p-12 text-center text-slate-400 text-sm">No chunks yet — pick a script and generate chunks above.</CardContent></Card>
        ) : (
          chunks.map((chunk, idx) => (
            <ChunkRow
              key={chunk.id}
              chunk={chunk}
              idx={idx}
              ocr={ocrMap[chunk.id]}
              ts={tsMap[chunk.id]}
              ai={aiMap[chunk.id]}
              clip={clipMap[chunk.id]}
              updateChunkFn={updateChunkFn}
              onChange={() => refreshAll(scriptId, slideSource)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ChunkRow({
  chunk, idx, ocr, ts, ai, clip, updateChunkFn, onChange,
}: any) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(chunk.content || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(chunk.content || ""); }, [chunk.content]);

  const save = async () => {
    if (!draft.trim()) return toast.error("Cannot be empty");
    setSaving(true);
    try {
      await updateChunkFn({ data: { id: chunk.id, content: draft } });
      toast.success(`Chunk ${idx + 1} saved`);
      setEditing(false);
      onChange();
    } catch (e: any) { toast.error("Save failed: " + e.message); }
    finally { setSaving(false); }
  };

  const Box = ({ title, status, children }: any) => (
    <div className="rounded-lg border bg-slate-50/50 p-2 space-y-1.5 min-h-[120px] flex flex-col">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{title}</span>
        {status}
      </div>
      <div className="flex-1 text-[11px] text-slate-700">{children}</div>
    </div>
  );

  const Pill = ({ ok, label }: { ok: boolean; label: string }) => (
    <span className={cn(
      "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase",
      ok ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"
    )}>{label}</span>
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-slate-50 py-2 px-4 border-b flex flex-row items-center justify-between">
        <CardTitle className="text-xs font-bold flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-purple-600 text-white flex items-center justify-center text-[10px]">{String(idx + 1).padStart(3, "0")}</span>
          Chunk {String(idx + 1).padStart(3, "0")} · {chunk.word_count} words
        </CardTitle>
        <div className="flex items-center gap-1.5">
          <Pill ok={!!chunk.audio_url} label="Audio" />
          <Pill ok={!!chunk.slide_url} label="Slide" />
          <Pill ok={!!ocr} label="OCR" />
          <Pill ok={!!ts} label="TS" />
          <Pill ok={!!ai} label="Ann" />
          <Pill ok={clip?.status === "done"} label="Render" />
        </div>
      </CardHeader>
      <CardContent className="p-3 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {/* Chunk Preview */}
        <Box title="Chunk Preview" status={
          editing ? (
            <div className="flex gap-1">
              <button onClick={() => { setEditing(false); setDraft(chunk.content || ""); }} className="p-0.5 text-slate-500 hover:text-red-600"><X className="h-3 w-3" /></button>
              <button onClick={save} disabled={saving} className="p-0.5 text-emerald-600">{saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}</button>
            </div>
          ) : (
            <button onClick={() => setEditing(true)} className="p-0.5 text-slate-500 hover:text-indigo-600"><Pencil className="h-3 w-3" /></button>
          )
        }>
          {editing ? (
            <Textarea value={draft} onChange={e => setDraft(e.target.value)} className="text-[11px] min-h-[90px] font-telugu" />
          ) : (
            <p className="line-clamp-6 font-telugu whitespace-pre-wrap">{chunk.content}</p>
          )}
        </Box>

        {/* Audio */}
        <Box title="Audio Preview" status={
          chunk.audio_job_status === "processing" ? <Loader2 className="h-3 w-3 animate-spin text-blue-500" /> :
          chunk.audio_job_status === "queued" ? <span className="text-[9px] text-amber-600 font-bold">QUEUED</span> :
          chunk.audio_job_status === "failed" ? <span className="text-[9px] text-red-600 font-bold">FAILED</span> : null
        }>
          {chunk.audio_url ? (
            <audio controls className="w-full h-8" src={chunk.audio_url} />
          ) : chunk.audio_job_status === "processing" ? (
            <span className="text-blue-600 italic">Generating…</span>
          ) : <span className="text-slate-400 italic">—</span>}
        </Box>

        {/* Slide */}
        <Box title="Slide Preview" status={
          chunk.slide_job_status === "processing" ? <Loader2 className="h-3 w-3 animate-spin text-rose-500" /> :
          chunk.slide_job_status === "queued" ? <span className="text-[9px] text-amber-600 font-bold">QUEUED</span> :
          chunk.slide_job_status === "failed" ? <span className="text-[9px] text-red-600 font-bold">FAILED</span> : null
        }>
          {chunk.slide_url ? (
            <a href={chunk.slide_url} target="_blank" rel="noreferrer">
              <img src={chunk.slide_url} alt={`Slide ${idx + 1}`} className="w-full h-20 object-cover rounded" />
            </a>
          ) : chunk.slide_job_status === "processing" ? (
            <span className="text-rose-600 italic">Generating…</span>
          ) : <span className="text-slate-400 italic">—</span>}
        </Box>

        {/* Render */}
        <Box title="Render Preview" status={
          clip?.status === "rendering" || clip?.status === "pending" ? <Loader2 className="h-3 w-3 animate-spin text-fuchsia-500" /> :
          clip?.status === "failed" ? <span className="text-[9px] text-red-600 font-bold">FAILED</span> : null
        }>
          {clip?.file_url ? (
            <video controls className="w-full h-20 rounded bg-black" src={clip.file_url} />
          ) : clip?.status === "rendering" || clip?.status === "pending" ? (
            <span className="text-fuchsia-600 italic">Rendering…</span>
          ) : <span className="text-slate-400 italic">—</span>}
        </Box>

        {/* OCR */}
        <Box title="OCR Preview" status={null}>
          {ocr ? (
            <p className="line-clamp-6 text-[10px]">
              {(() => {
                try {
                  const w = JSON.parse(ocr.words || "[]");
                  return w.map((x: any) => x.text).join(" ") || "(no words)";
                } catch { return ocr.words?.slice(0, 200) || "—"; }
              })()}
            </p>
          ) : <span className="text-slate-400 italic">—</span>}
        </Box>

        {/* Timestamps + Annotations stacked */}
        <div className="space-y-2">
          <Box title="Timestamps" status={null}>
            {ts ? (
              <p className="line-clamp-3 text-[10px]">
                {(() => {
                  try {
                    const w = JSON.parse(ts.words || "[]");
                    return `${w.length} words`;
                  } catch { return "OK"; }
                })()}
              </p>
            ) : <span className="text-slate-400 italic">—</span>}
          </Box>
          <Box title="Annotations" status={null}>
            {ai ? (
              <p className="line-clamp-3 text-[10px]">
                {(() => {
                  try {
                    const arr = JSON.parse(ai.annotations || "[]");
                    return `${arr.length} matches`;
                  } catch { return "OK"; }
                })()}
              </p>
            ) : <span className="text-slate-400 italic">—</span>}
          </Box>
        </div>
      </CardContent>
    </Card>
  );
}
