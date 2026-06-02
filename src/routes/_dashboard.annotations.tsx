import { useEffect, useMemo, useState } from "react";
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
import { runOcr, runOcrAll } from "@/lib/ocr.functions";
import { cn } from "@/lib/utils";

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
  const [scripts, setScripts] = useState<any[]>([]);
  const [scriptId, setScriptId] = useState<string>("");
  const [slideSource, setSlideSource] = useState<SlideSource>("gamma");
  const [chunks, setChunks] = useState<any[]>([]);
  const [ocrMap, setOcrMap] = useState<Record<string, any>>({});
  const [tsMap, setTsMap] = useState<Record<string, any>>({});
  const [aiMap, setAiMap] = useState<Record<string, any>>({});
  const [clipMap, setClipMap] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggleExp = (k: string) => setExpanded((e) => ({ ...e, [k]: !e[k] }));
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [mergeState, setMergeState] = useState<{ status: string; url?: string | null; error?: string | null; clip_count?: number }>({ status: "idle" });

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
      const res = await runOcr({ data: { scriptId, chunkId: chunk.id, chunkNumber: chunk.chunk_index, slideSource } });
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
      toast.success(`Timestamps done — chunk ${chunk.chunk_index} (${res.word_count} words via ElevenLabs)`);
      await refreshAll(scriptId, slideSource);
    } catch (e: any) { toast.error(`Timestamps failed: ${e.message}`); }
    finally { setRowBusy(k, false); }
  };


  const runAi = async (chunk: any) => {
    const k = `ai:${chunk.id}`; setRowBusy(k, true);
    try {
      await workerPost("/ai/run", { script_id: scriptId, chunk_id: chunk.id, chunk_number: chunk.chunk_index, slide_source: slideSource });
      toast.success(`Annotations done — chunk ${chunk.chunk_index}`);
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

  // ── bulk actions
  const bulk = async (label: string, path: string) => {
    if (!scriptId) return toast.error("Pick a script first");
    setBulkBusy(label);
    try {
      if (path === "/timestamps/run-all") {
        // Timestamps now run via ElevenLabs forced alignment (server fn).
        const res = await runTimestampsAll({ data: { scriptId } });
        const failedMsg = res.failed ? `, ${res.failed} failed` : "";
        toast.success(`${label}: ${res.succeeded}/${res.queued} chunks${failedMsg}`);
      } else {
        const body: any = { script_id: scriptId, slide_source: slideSource };
        const res = await workerPost(path, body);
        toast.success(`${label}: queued ${res.queued ?? ""} chunks`);
      }
      setTimeout(() => refreshAll(scriptId, slideSource), 1500);
    } catch (e: any) { toast.error(`${label} failed: ${e.message}`); }
    finally { setTimeout(() => setBulkBusy(null), 1200); }
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
        <Button disabled={!!bulkBusy || !scriptId} onClick={() => bulk("All OCR", "/ocr/run-all")} className="bg-sky-500 hover:bg-sky-600 rounded-xl gap-2 h-10">
          {bulkBusy === "All OCR" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} All OCR
        </Button>
        <Button disabled={!!bulkBusy || !scriptId} onClick={() => bulk("All Timestamps", "/timestamps/run-all")} className="bg-emerald-500 hover:bg-emerald-600 rounded-xl gap-2 h-10">
          {bulkBusy === "All Timestamps" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} All Timestamps
        </Button>
        <Button disabled={!!bulkBusy || !scriptId} onClick={() => bulk("All Annotations", "/ai/run-all")} className="bg-violet-500 hover:bg-violet-600 rounded-xl gap-2 h-10">
          {bulkBusy === "All Annotations" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} All Annotations
        </Button>
        <Button disabled={!!bulkBusy || !scriptId} onClick={() => bulk("Render All", "/clips/render-all")} className="bg-rose-500 hover:bg-rose-600 rounded-xl gap-2 h-10">
          {bulkBusy === "Render All" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Render All
        </Button>
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
            <a href={mergeState.url} target="_blank" rel="noreferrer">
              <Button className="bg-white text-indigo-700 hover:bg-white/90 rounded-xl gap-2 h-10"><Download className="h-4 w-4" /> Download MP4</Button>
            </a>
          )}
          <Button onClick={mergeMega} disabled={!!bulkBusy || !scriptId} className="bg-white/15 hover:bg-white/25 backdrop-blur rounded-xl gap-2 h-10 border border-white/30">
            {bulkBusy === "Merge" || mergeState.status === "running" || mergeState.status === "queued"
              ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Merge Mega Video
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
                <Tile label="Original Script" color="slate">
                  <p className="text-xs text-slate-600 line-clamp-6 leading-relaxed whitespace-pre-wrap">{chunk.content}</p>
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
