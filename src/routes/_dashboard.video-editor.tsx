import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Play, Pause, SkipBack, SkipForward, Rewind, FastForward,
  Volume2, VolumeX, Maximize2, PictureInPicture2, Repeat,
  Scissors, Camera, Download, RotateCw, FlipHorizontal, FlipVertical,
  Type, Sparkles, Eraser, Undo2, Redo2, Loader2, Film, Plus, Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_dashboard/video-editor")({
  component: VideoEditorPage,
});

type MergedVideo = {
  script_id: string;
  title: string;
  url: string;
  updated_at: string;
};

type TrimSegment = { id: string; start: number; end: number };
type TextOverlay = {
  id: string;
  text: string;
  x: number; y: number;
  size: number;
  color: string;
  bg: string;
  start: number; end: number;
  bold: boolean;
};

const FILTER_DEFAULTS = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  hue: 0,
  blur: 0,
  grayscale: 0,
  sepia: 0,
  invert: 0,
};

const fmtTime = (s: number) => {
  if (!isFinite(s)) return "0:00.00";
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2).padStart(5, "0");
  return `${m}:${sec}`;
};

function VideoEditorPage() {
  const [videos, setVideos] = useState<MergedVideo[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState<string>("");
  const selected = videos.find(v => v.script_id === selectedId);

  // playback
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(false);

  // transform
  const [rotate, setRotate] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [zoom, setZoom] = useState(100);

  // filters
  const [filters, setFilters] = useState({ ...FILTER_DEFAULTS });

  // trim / segments
  const [inPoint, setInPoint] = useState(0);
  const [outPoint, setOutPoint] = useState(0);
  const [segments, setSegments] = useState<TrimSegment[]>([]);

  // overlays
  const [overlays, setOverlays] = useState<TextOverlay[]>([]);

  // history
  const historyRef = useRef<any[]>([]);
  const futureRef = useRef<any[]>([]);

  const snapshotState = useCallback(() => ({
    filters: { ...filters },
    rotate, flipH, flipV, zoom,
    segments: [...segments],
    overlays: [...overlays],
    inPoint, outPoint,
  }), [filters, rotate, flipH, flipV, zoom, segments, overlays, inPoint, outPoint]);

  const pushHistory = () => {
    historyRef.current.push(snapshotState());
    if (historyRef.current.length > 50) historyRef.current.shift();
    futureRef.current = [];
  };

  const applyState = (s: any) => {
    setFilters(s.filters);
    setRotate(s.rotate); setFlipH(s.flipH); setFlipV(s.flipV); setZoom(s.zoom);
    setSegments(s.segments); setOverlays(s.overlays);
    setInPoint(s.inPoint); setOutPoint(s.outPoint);
  };

  const undo = () => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    futureRef.current.push(snapshotState());
    applyState(prev);
  };
  const redo = () => {
    const next = futureRef.current.pop();
    if (!next) return;
    historyRef.current.push(snapshotState());
    applyState(next);
  };

  // load list
  useEffect(() => {
    (async () => {
      setLoadingList(true);
      try {
        const { data: meta, error } = await supabase
          .from("app_metadata")
          .select("key, value, updated_at")
          .like("key", "merge:%")
          .order("updated_at", { ascending: false });
        if (error) throw error;
        const ids = (meta || []).map((m: any) => String(m.key).replace("merge:", ""));
        let titleMap: Record<string, string> = {};
        if (ids.length) {
          const { data: scripts } = await supabase
            .from("scripts").select("id,title").in("id", ids);
          titleMap = Object.fromEntries((scripts || []).map((s: any) => [s.id, s.title || "Untitled"]));
        }
        const built: MergedVideo[] = (meta || [])
          .map((m: any) => {
            const sid = String(m.key).replace("merge:", "");
            const v = m.value || {};
            return {
              script_id: sid,
              title: titleMap[sid] || `Script ${sid.slice(0, 8)}`,
              url: v.url || "",
              updated_at: m.updated_at,
            };
          })
          .filter((r) => r.url && (meta || []).find((m: any) => m.key === `merge:${r.script_id}` && (m.value?.status === "done")));
        setVideos(built);
      } catch (e: any) {
        toast.error(`Failed to load videos: ${e.message}`);
      } finally {
        setLoadingList(false);
      }
    })();
  }, []);

  // sync video element with controls
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted;
    v.playbackRate = rate;
    v.loop = loop;
  }, [volume, muted, rate, loop, selectedId]);

  // reset state on video change
  useEffect(() => {
    if (!selected) return;
    historyRef.current = [];
    futureRef.current = [];
    setSegments([]); setOverlays([]);
    setFilters({ ...FILTER_DEFAULTS });
    setRotate(0); setFlipH(false); setFlipV(false); setZoom(100);
    setInPoint(0); setOutPoint(0);
    setCurrent(0); setDuration(0); setPlaying(false);
  }, [selectedId]);

  const togglePlay = () => {
    const v = videoRef.current; if (!v) return;
    if (v.paused) v.play(); else v.pause();
  };

  const seek = (t: number) => {
    const v = videoRef.current; if (!v) return;
    v.currentTime = Math.max(0, Math.min(duration || 0, t));
  };

  const stepFrame = (dir: 1 | -1) => {
    seek(current + dir * (1 / 30));
  };

  const filterCss = useMemo(() => (
    `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturate}%) hue-rotate(${filters.hue}deg) blur(${filters.blur}px) grayscale(${filters.grayscale}%) sepia(${filters.sepia}%) invert(${filters.invert}%)`
  ), [filters]);

  const transformCss = useMemo(() => (
    `rotate(${rotate}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1}) scale(${zoom / 100})`
  ), [rotate, flipH, flipV, zoom]);

  const visibleOverlays = overlays.filter(o => current >= o.start && current <= o.end);

  // actions
  const markIn = () => { pushHistory(); setInPoint(current); };
  const markOut = () => { pushHistory(); setOutPoint(current); };
  const addSegment = () => {
    if (outPoint <= inPoint) { toast.error("Set IN < OUT"); return; }
    pushHistory();
    setSegments(prev => [...prev, { id: crypto.randomUUID(), start: inPoint, end: outPoint }]);
    toast.success("Segment added");
  };
  const removeSegment = (id: string) => { pushHistory(); setSegments(prev => prev.filter(s => s.id !== id)); };

  const splitAtPlayhead = () => {
    pushHistory();
    const t = current;
    setSegments(prev => prev.flatMap(s => {
      if (t > s.start && t < s.end) {
        return [{ ...s, end: t }, { id: crypto.randomUUID(), start: t, end: s.end }];
      }
      return [s];
    }));
    toast.success(`Split at ${fmtTime(t)}`);
  };

  const addOverlay = () => {
    pushHistory();
    setOverlays(prev => [...prev, {
      id: crypto.randomUUID(),
      text: "New text",
      x: 50, y: 50, size: 32,
      color: "#ffffff", bg: "transparent",
      start: current, end: Math.min(duration, current + 3),
      bold: true,
    }]);
  };
  const updateOverlay = (id: string, patch: Partial<TextOverlay>) => {
    setOverlays(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o));
  };
  const removeOverlay = (id: string) => { pushHistory(); setOverlays(prev => prev.filter(o => o.id !== id)); };

  const snapshot = async () => {
    const v = videoRef.current; if (!v) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth; canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.filter = filterCss;
    ctx.drawImage(v, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `frame_${Math.round(current * 100)}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    }, "image/png");
  };

  const enterFullscreen = () => containerRef.current?.requestFullscreen?.();
  const enterPip = async () => {
    const v = videoRef.current as any;
    if (v && document.pictureInPictureEnabled) {
      try { await v.requestPictureInPicture(); } catch {}
    }
  };

  const resetAll = () => {
    pushHistory();
    setFilters({ ...FILTER_DEFAULTS });
    setRotate(0); setFlipH(false); setFlipV(false); setZoom(100);
  };

  const exportEditPlan = () => {
    if (!selected) return;
    const plan = {
      source: selected.url,
      title: selected.title,
      duration,
      filters, rotate, flipH, flipV, zoom,
      segments, overlays,
      inPoint, outPoint,
    };
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `edit_${selected.script_id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("Edit plan exported");
  };

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      else if (e.key === "ArrowLeft") seek(current - (e.shiftKey ? 5 : 1));
      else if (e.key === "ArrowRight") seek(current + (e.shiftKey ? 5 : 1));
      else if (e.key === ",") stepFrame(-1);
      else if (e.key === ".") stepFrame(1);
      else if (e.key === "i") markIn();
      else if (e.key === "o") markOut();
      else if (e.key === "s") splitAtPlayhead();
      else if (e.key === "m") setMuted(m => !m);
      else if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold bg-fuchsia-500/15 text-fuchsia-600 px-1.5 py-0.5 rounded uppercase tracking-wider">
              Advanced
            </span>
            <span className="text-[10px] text-slate-400 font-medium tracking-wider">• VIDEO EDITOR</span>
          </div>
          <h1 className="text-2xl font-bold">Video Editor</h1>
          <p className="text-slate-500 text-sm">Pick a merged video and edit. Standalone tool — does not change any other page.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={undo}><Undo2 className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" onClick={redo}><Redo2 className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" onClick={resetAll}><Eraser className="h-4 w-4 mr-1" />Reset</Button>
          <Button size="sm" onClick={exportEditPlan} disabled={!selected}><Download className="h-4 w-4 mr-1" />Export Plan</Button>
        </div>
      </div>

      {/* Video picker */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center gap-3 flex-wrap">
        <Film className="h-4 w-4 text-slate-500" />
        <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Final Rendered Video</Label>
        <div className="flex-1 min-w-[260px]">
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger>
              <SelectValue placeholder={loadingList ? "Loading…" : "Choose a merged video"} />
            </SelectTrigger>
            <SelectContent>
              {videos.map(v => (
                <SelectItem key={v.script_id} value={v.script_id}>
                  {v.title} — {new Date(v.updated_at).toLocaleDateString()}
                </SelectItem>
              ))}
              {!loadingList && videos.length === 0 && (
                <div className="p-2 text-xs text-slate-500">No merged videos found.</div>
              )}
            </SelectContent>
          </Select>
        </div>
        {selected && (
          <a href={selected.url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 underline">open source</a>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        {/* Preview + Timeline */}
        <div className="space-y-3">
          <div
            ref={containerRef}
            className="relative bg-black rounded-2xl overflow-hidden flex items-center justify-center"
            style={{ aspectRatio: "16/9" }}
          >
            {selected ? (
              <>
                <video
                  ref={videoRef}
                  key={selected.url}
                  src={selected.url}
                  crossOrigin="anonymous"
                  preload="auto"
                  playsInline
                  className="absolute inset-0 w-full h-full object-contain transition-[filter,transform] duration-150"
                  style={{ filter: filterCss, transform: transformCss }}
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget;
                    setDuration(v.duration || 0);
                    if (outPoint === 0) setOutPoint(v.duration || 0);
                    // seek a bit to avoid black first frame
                    try { v.currentTime = 0.05; } catch {}
                  }}
                  onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onError={() => toast.error("Video failed to load")}
                />
                {/* Overlays */}
                <div className="absolute inset-0 pointer-events-none">
                  {visibleOverlays.map(o => (
                    <div
                      key={o.id}
                      className="absolute -translate-x-1/2 -translate-y-1/2 px-2 py-1 rounded"
                      style={{
                        left: `${o.x}%`, top: `${o.y}%`,
                        color: o.color, background: o.bg,
                        fontSize: o.size, fontWeight: o.bold ? 800 : 500,
                        textShadow: "0 2px 8px rgba(0,0,0,0.6)",
                      }}
                    >{o.text}</div>
                  ))}
                </div>
                {/* Center play */}
                {!playing && (
                  <button
                    onClick={togglePlay}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    <div className="bg-white/90 hover:bg-white text-black rounded-full p-5 shadow-2xl">
                      <Play className="h-8 w-8" />
                    </div>
                  </button>
                )}
              </>
            ) : (
              <div className="text-slate-400 text-sm">Select a video to start editing</div>
            )}
          </div>

          {/* Transport */}
          <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="icon" variant="outline" onClick={() => seek(0)}><SkipBack className="h-4 w-4" /></Button>
              <Button size="icon" variant="outline" onClick={() => seek(current - 5)}><Rewind className="h-4 w-4" /></Button>
              <Button size="icon" variant="outline" onClick={() => stepFrame(-1)} title="Prev frame (,)">⟨</Button>
              <Button size="icon" onClick={togglePlay}>{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Button>
              <Button size="icon" variant="outline" onClick={() => stepFrame(1)} title="Next frame (.)">⟩</Button>
              <Button size="icon" variant="outline" onClick={() => seek(current + 5)}><FastForward className="h-4 w-4" /></Button>
              <Button size="icon" variant="outline" onClick={() => seek(duration)}><SkipForward className="h-4 w-4" /></Button>

              <div className="mx-2 text-xs font-mono text-slate-600">
                {fmtTime(current)} / {fmtTime(duration)}
              </div>

              <Button size="sm" variant={loop ? "default" : "outline"} onClick={() => setLoop(l => !l)}>
                <Repeat className="h-4 w-4" />
              </Button>
              <Select value={String(rate)} onValueChange={(v) => setRate(parseFloat(v))}>
                <SelectTrigger className="w-[90px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4].map(r => (
                    <SelectItem key={r} value={String(r)}>{r}x</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2 ml-2">
                <Button size="icon" variant="outline" onClick={() => setMuted(m => !m)}>
                  {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>
                <div className="w-24">
                  <Slider value={[volume * 100]} min={0} max={100} step={1} onValueChange={(v) => setVolume(v[0] / 100)} />
                </div>
              </div>

              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={snapshot}><Camera className="h-4 w-4 mr-1" />Snap</Button>
                <Button size="sm" variant="outline" onClick={enterPip}><PictureInPicture2 className="h-4 w-4" /></Button>
                <Button size="sm" variant="outline" onClick={enterFullscreen}><Maximize2 className="h-4 w-4" /></Button>
              </div>
            </div>

            {/* Scrubber */}
            <div className="space-y-1">
              <Slider
                value={[current]}
                min={0}
                max={duration || 1}
                step={0.01}
                onValueChange={(v) => seek(v[0])}
              />
              {/* Timeline ruler with segments + markers */}
              <div className="relative h-10 rounded-md bg-slate-100 overflow-hidden">
                {duration > 0 && (
                  <>
                    {segments.map(s => (
                      <div key={s.id}
                        className="absolute top-0 bottom-0 bg-indigo-400/40 border-l border-r border-indigo-500"
                        style={{ left: `${(s.start / duration) * 100}%`, width: `${((s.end - s.start) / duration) * 100}%` }}
                        title={`${fmtTime(s.start)} → ${fmtTime(s.end)}`}
                      />
                    ))}
                    <div className="absolute top-0 bottom-0 w-0.5 bg-green-500"
                      style={{ left: `${(inPoint / duration) * 100}%` }} title={`IN ${fmtTime(inPoint)}`} />
                    <div className="absolute top-0 bottom-0 w-0.5 bg-red-500"
                      style={{ left: `${(outPoint / duration) * 100}%` }} title={`OUT ${fmtTime(outPoint)}`} />
                    <div className="absolute top-0 bottom-0 w-0.5 bg-amber-500"
                      style={{ left: `${(current / duration) * 100}%` }} />
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap text-xs">
              <Button size="sm" variant="outline" onClick={markIn}><span className="text-green-600 font-bold mr-1">[</span>Mark IN</Button>
              <Button size="sm" variant="outline" onClick={markOut}>Mark OUT<span className="text-red-600 font-bold ml-1">]</span></Button>
              <Button size="sm" variant="outline" onClick={addSegment}><Scissors className="h-3 w-3 mr-1" />Add segment</Button>
              <Button size="sm" variant="outline" onClick={splitAtPlayhead}>Split @ playhead</Button>
              <span className="font-mono text-slate-500">IN {fmtTime(inPoint)} · OUT {fmtTime(outPoint)}</span>
            </div>
          </div>

          {/* Segments list */}
          {segments.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Segments ({segments.length})</div>
              <div className="space-y-1.5">
                {segments.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-2 text-xs">
                    <span className="w-6 text-slate-400">#{i + 1}</span>
                    <span className="font-mono">{fmtTime(s.start)} → {fmtTime(s.end)}</span>
                    <span className="text-slate-400">({(s.end - s.start).toFixed(2)}s)</span>
                    <Button size="sm" variant="ghost" onClick={() => seek(s.start)}>Preview</Button>
                    <Button size="sm" variant="ghost" onClick={() => removeSegment(s.id)}><Trash2 className="h-3 w-3 text-red-500" /></Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right panel: tabs */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <Tabs defaultValue="filters">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="filters"><Sparkles className="h-3.5 w-3.5 mr-1" />FX</TabsTrigger>
              <TabsTrigger value="transform"><RotateCw className="h-3.5 w-3.5 mr-1" />Xform</TabsTrigger>
              <TabsTrigger value="text"><Type className="h-3.5 w-3.5 mr-1" />Text</TabsTrigger>
              <TabsTrigger value="info">Info</TabsTrigger>
            </TabsList>

            <TabsContent value="filters" className="space-y-3 mt-3">
              {([
                ["brightness", 0, 200],
                ["contrast", 0, 200],
                ["saturate", 0, 200],
                ["hue", 0, 360],
                ["blur", 0, 20],
                ["grayscale", 0, 100],
                ["sepia", 0, 100],
                ["invert", 0, 100],
              ] as const).map(([k, min, max]) => (
                <div key={k}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="capitalize">{k}</span>
                    <span className="font-mono text-slate-500">{(filters as any)[k]}</span>
                  </div>
                  <Slider
                    value={[(filters as any)[k]]}
                    min={min} max={max} step={1}
                    onValueChange={(v) => setFilters(f => ({ ...f, [k]: v[0] }))}
                    onValueCommit={pushHistory}
                  />
                </div>
              ))}
              <Button size="sm" variant="outline" className="w-full" onClick={() => { pushHistory(); setFilters({ ...FILTER_DEFAULTS }); }}>
                Reset Filters
              </Button>
            </TabsContent>

            <TabsContent value="transform" className="space-y-3 mt-3">
              <div>
                <div className="flex justify-between text-xs mb-1"><span>Rotate</span><span className="font-mono">{rotate}°</span></div>
                <Slider value={[rotate]} min={-180} max={180} step={1}
                  onValueChange={(v) => setRotate(v[0])} onValueCommit={pushHistory} />
                <div className="flex gap-1 mt-2">
                  {[0, 90, 180, 270].map(deg => (
                    <Button key={deg} size="sm" variant="outline" onClick={() => { pushHistory(); setRotate(deg); }}>{deg}°</Button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant={flipH ? "default" : "outline"} className="flex-1" onClick={() => { pushHistory(); setFlipH(f => !f); }}>
                  <FlipHorizontal className="h-4 w-4 mr-1" />Flip H
                </Button>
                <Button size="sm" variant={flipV ? "default" : "outline"} className="flex-1" onClick={() => { pushHistory(); setFlipV(f => !f); }}>
                  <FlipVertical className="h-4 w-4 mr-1" />Flip V
                </Button>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1"><span>Zoom</span><span className="font-mono">{zoom}%</span></div>
                <Slider value={[zoom]} min={10} max={300} step={1}
                  onValueChange={(v) => setZoom(v[0])} onValueCommit={pushHistory} />
              </div>
            </TabsContent>

            <TabsContent value="text" className="space-y-3 mt-3">
              <Button size="sm" className="w-full" onClick={addOverlay} disabled={!selected}>
                <Plus className="h-4 w-4 mr-1" />Add text @ {fmtTime(current)}
              </Button>
              <div className="space-y-3 max-h-[420px] overflow-y-auto">
                {overlays.map(o => (
                  <div key={o.id} className="rounded-xl border border-slate-200 p-3 space-y-2">
                    <Input value={o.text} onChange={(e) => updateOverlay(o.id, { text: e.target.value })} />
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <Label className="text-[10px]">X%</Label>
                        <Input type="number" value={o.x} onChange={(e) => updateOverlay(o.id, { x: +e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-[10px]">Y%</Label>
                        <Input type="number" value={o.y} onChange={(e) => updateOverlay(o.id, { y: +e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-[10px]">Size</Label>
                        <Input type="number" value={o.size} onChange={(e) => updateOverlay(o.id, { size: +e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-[10px]">Color</Label>
                        <input type="color" value={o.color} onChange={(e) => updateOverlay(o.id, { color: e.target.value })} className="w-full h-9 rounded" />
                      </div>
                      <div>
                        <Label className="text-[10px]">Start (s)</Label>
                        <Input type="number" step="0.1" value={o.start} onChange={(e) => updateOverlay(o.id, { start: +e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-[10px]">End (s)</Label>
                        <Input type="number" step="0.1" value={o.end} onChange={(e) => updateOverlay(o.id, { end: +e.target.value })} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => updateOverlay(o.id, { bold: !o.bold })}>
                        {o.bold ? "Bold ✓" : "Bold"}
                      </Button>
                      <Button size="sm" variant="ghost" className="ml-auto" onClick={() => removeOverlay(o.id)}>
                        <Trash2 className="h-3 w-3 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
                {overlays.length === 0 && <p className="text-xs text-slate-400 text-center py-4">No text overlays</p>}
              </div>
            </TabsContent>

            <TabsContent value="info" className="space-y-2 mt-3 text-xs">
              <div className="rounded-lg bg-slate-50 p-3 space-y-1">
                <div><b>Source:</b> {selected?.title || "—"}</div>
                <div><b>Duration:</b> {fmtTime(duration)}</div>
                <div><b>Segments:</b> {segments.length}</div>
                <div><b>Overlays:</b> {overlays.length}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 space-y-1">
                <p className="font-bold mb-1">Keyboard shortcuts</p>
                <div><kbd>Space</kbd> play/pause</div>
                <div><kbd>← →</kbd> seek 1s (shift = 5s)</div>
                <div><kbd>, .</kbd> frame step</div>
                <div><kbd>I / O</kbd> mark IN / OUT</div>
                <div><kbd>S</kbd> split at playhead</div>
                <div><kbd>M</kbd> mute</div>
                <div><kbd>Ctrl+Z / Y</kbd> undo / redo</div>
              </div>
              <p className="text-slate-400">
                This is a standalone visual editor. Export Plan saves your edit as JSON
                (filters, transforms, segments, text overlays) that can be applied by a
                renderer later. Snap downloads the current frame as PNG with filters baked in.
              </p>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
