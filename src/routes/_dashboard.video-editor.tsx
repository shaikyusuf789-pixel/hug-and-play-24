import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Play, Pause, SkipBack, SkipForward, Rewind, FastForward,
  Volume2, VolumeX, Maximize2, PictureInPicture2, Repeat,
  Scissors, Camera, Download, RotateCw, FlipHorizontal, FlipVertical,
  Type, Sparkles, Eraser, Undo2, Redo2, Loader2, Film, Plus, Trash2, Save,
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
  bucket?: string;
  path?: string;
};

// A CUT is a range to REMOVE from the final video (razor + delete-between)
type Cut = { id: string; start: number; end: number };

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
  brightness: 100, contrast: 100, saturate: 100, hue: 0,
  blur: 0, grayscale: 0, sepia: 0, invert: 0,
};

const fmtTime = (s: number) => {
  if (!isFinite(s)) return "0:00.00";
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2).padStart(5, "0");
  return `${m}:${sec}`;
};

// Parse a public Supabase storage URL into { bucket, path }
function parseSupabaseStorageUrl(url: string): { bucket: string; path: string } | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
    if (!m) return null;
    return { bucket: decodeURIComponent(m[1]), path: decodeURIComponent(m[2].split("?")[0]) };
  } catch { return null; }
}

// Merge overlapping/adjacent cuts and clamp to [0, duration]
function normalizeCuts(cuts: Cut[], duration: number): Cut[] {
  const cleaned = cuts
    .map(c => ({ ...c, start: Math.max(0, Math.min(duration, c.start)), end: Math.max(0, Math.min(duration, c.end)) }))
    .filter(c => c.end - c.start > 0.02)
    .sort((a, b) => a.start - b.start);
  const out: Cut[] = [];
  for (const c of cleaned) {
    const last = out[out.length - 1];
    if (last && c.start <= last.end + 0.001) {
      last.end = Math.max(last.end, c.end);
    } else {
      out.push({ ...c });
    }
  }
  return out;
}

// Invert cuts → list of KEPT ranges [start,end]
function keptRanges(cuts: Cut[], duration: number): { start: number; end: number }[] {
  const norm = normalizeCuts(cuts, duration);
  const ranges: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const c of norm) {
    if (c.start > cursor + 0.01) ranges.push({ start: cursor, end: c.start });
    cursor = Math.max(cursor, c.end);
  }
  if (cursor < duration - 0.01) ranges.push({ start: cursor, end: duration });
  return ranges;
}

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

  // razor / cuts (delete-between)
  const [inPoint, setInPoint] = useState(0);
  const [outPoint, setOutPoint] = useState(0);
  const [cuts, setCuts] = useState<Cut[]>([]);
  const [razorPoints, setRazorPoints] = useState<number[]>([]); // blade marks on timeline

  // overlays
  const [overlays, setOverlays] = useState<TextOverlay[]>([]);

  // waveform
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const waveScrollRef = useRef<HTMLDivElement>(null);
  const [wavePeaks, setWavePeaks] = useState<Float32Array | null>(null);
  const [waveLoading, setWaveLoading] = useState(false);
  const [waveZoom, setWaveZoom] = useState(1); // 1x..50x
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const dragRef = useRef<{ startX: number; startT: number } | null>(null);


  // saving
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [saveMsg, setSaveMsg] = useState("");

  // history
  const historyRef = useRef<any[]>([]);
  const futureRef = useRef<any[]>([]);

  const snapshotState = useCallback(() => ({
    filters: { ...filters }, rotate, flipH, flipV, zoom,
    cuts: cuts.map(c => ({ ...c })),
    razorPoints: [...razorPoints],
    overlays: overlays.map(o => ({ ...o })),
    inPoint, outPoint,
  }), [filters, rotate, flipH, flipV, zoom, cuts, razorPoints, overlays, inPoint, outPoint]);

  const pushHistory = () => {
    historyRef.current.push(snapshotState());
    if (historyRef.current.length > 50) historyRef.current.shift();
    futureRef.current = [];
  };

  const applyState = (s: any) => {
    setFilters(s.filters);
    setRotate(s.rotate); setFlipH(s.flipH); setFlipV(s.flipV); setZoom(s.zoom);
    setCuts(s.cuts); setRazorPoints(s.razorPoints || []);
    setOverlays(s.overlays);
    setInPoint(s.inPoint); setOutPoint(s.outPoint);
  };

  const undo = () => { const p = historyRef.current.pop(); if (!p) return; futureRef.current.push(snapshotState()); applyState(p); };
  const redo = () => { const n = futureRef.current.pop(); if (!n) return; historyRef.current.push(snapshotState()); applyState(n); };

  // load merged videos
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
          const { data: scripts } = await supabase.from("scripts").select("id,title").in("id", ids);
          titleMap = Object.fromEntries((scripts || []).map((s: any) => [s.id, s.title || "Untitled"]));
        }
        const built: MergedVideo[] = (meta || [])
          .map((m: any) => {
            const sid = String(m.key).replace("merge:", "");
            const v = m.value || {};
            const parsed = v.url ? parseSupabaseStorageUrl(v.url) : null;
            return {
              script_id: sid,
              title: titleMap[sid] || `Script ${sid.slice(0, 8)}`,
              url: v.url || "",
              updated_at: m.updated_at,
              bucket: parsed?.bucket,
              path: parsed?.path,
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

  // sync video element
  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    v.volume = volume; v.muted = muted; v.playbackRate = rate; v.loop = loop;
  }, [volume, muted, rate, loop, selectedId]);

  // reset on change + load waveform
  useEffect(() => {
    if (!selected) return;
    historyRef.current = []; futureRef.current = [];
    setCuts([]); setRazorPoints([]); setOverlays([]);
    setFilters({ ...FILTER_DEFAULTS });
    setRotate(0); setFlipH(false); setFlipV(false); setZoom(100);
    setInPoint(0); setOutPoint(0);
    setCurrent(0); setDuration(0); setPlaying(false);
    setWavePeaks(null);
    void loadWaveform(selected.url);
  }, [selectedId]);

  // ripple-skip during playback
  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    const norm = normalizeCuts(cuts, duration || v.duration || 0);
    for (const c of norm) {
      if (current >= c.start - 0.01 && current < c.end - 0.05) {
        try { v.currentTime = Math.min((duration || v.duration), c.end + 0.001); } catch {}
        break;
      }
    }
  }, [current, cuts, duration]);

  const loadWaveform = async (url: string) => {
    setWaveLoading(true);
    try {
      const resp = await fetch(url);
      const buf = await resp.arrayBuffer();
      const AC: typeof AudioContext = (window.AudioContext || (window as any).webkitAudioContext);
      const ac = new AC();
      const audio = await ac.decodeAudioData(buf.slice(0));
      const ch = audio.getChannelData(0);
      const BUCKETS = 1200;
      const block = Math.max(1, Math.floor(ch.length / BUCKETS));
      const peaks = new Float32Array(BUCKETS);
      for (let i = 0; i < BUCKETS; i++) {
        let max = 0;
        const start = i * block;
        const end = Math.min(ch.length, start + block);
        for (let j = start; j < end; j++) {
          const a = Math.abs(ch[j]);
          if (a > max) max = a;
        }
        peaks[i] = max;
      }
      setWavePeaks(peaks);
      ac.close();
    } catch (e: any) {
      console.warn("waveform decode failed", e);
    } finally {
      setWaveLoading(false);
    }
  };

  // draw waveform
  useEffect(() => {
    const cvs = waveCanvasRef.current; if (!cvs) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cvs.clientWidth, h = cvs.clientHeight;
    cvs.width = w * dpr; cvs.height = h * dpr;
    const ctx = cvs.getContext("2d"); if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // background
    ctx.fillStyle = "#f1f5f9";
    ctx.fillRect(0, 0, w, h);

    if (wavePeaks && wavePeaks.length) {
      const mid = h / 2;
      const step = w / wavePeaks.length;
      ctx.fillStyle = "#6366f1";
      for (let i = 0; i < wavePeaks.length; i++) {
        const v = wavePeaks[i];
        const barH = Math.max(1, v * (h - 4));
        ctx.fillRect(i * step, mid - barH / 2, Math.max(1, step * 0.85), barH);
      }
    } else if (waveLoading) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "11px ui-sans-serif";
      ctx.fillText("Loading waveform…", 8, h / 2 + 4);
    }

    if (!duration) return;

    // cut regions (red translucent)
    const norm = normalizeCuts(cuts, duration);
    for (const c of norm) {
      const x = (c.start / duration) * w;
      const ww = ((c.end - c.start) / duration) * w;
      ctx.fillStyle = "rgba(239,68,68,0.35)";
      ctx.fillRect(x, 0, ww, h);
      ctx.strokeStyle = "#dc2626";
      ctx.setLineDash([3, 2]);
      ctx.strokeRect(x + 0.5, 0.5, ww - 1, h - 1);
      ctx.setLineDash([]);
    }

    // razor marks
    ctx.strokeStyle = "#0ea5e9";
    ctx.lineWidth = 1.5;
    for (const t of razorPoints) {
      const x = (t / duration) * w;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }

    // in/out
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#16a34a";
    let x = (inPoint / duration) * w;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    ctx.strokeStyle = "#ef4444";
    x = (outPoint / duration) * w;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();

    // selection (yellow translucent)
    if (selection && duration) {
      const s = Math.min(selection.start, selection.end);
      const eT = Math.max(selection.start, selection.end);
      const sx = (s / duration) * w;
      const sw = ((eT - s) / duration) * w;
      ctx.fillStyle = "rgba(250,204,21,0.35)";
      ctx.fillRect(sx, 0, sw, h);
      ctx.strokeStyle = "#ca8a04";
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, 0.5, sw - 1, h - 1);
    }

    // playhead
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2;
    x = (current / duration) * w;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }, [wavePeaks, waveLoading, duration, cuts, razorPoints, inPoint, outPoint, current, waveZoom, selection]);


  const togglePlay = () => { const v = videoRef.current; if (!v) return; if (v.paused) v.play(); else v.pause(); };
  const seek = (t: number) => { const v = videoRef.current; if (!v) return; v.currentTime = Math.max(0, Math.min(duration || 0, t)); };
  const stepFrame = (dir: 1 | -1) => seek(current + dir * (1 / 30));

  const filterCss = useMemo(() =>
    `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturate}%) hue-rotate(${filters.hue}deg) blur(${filters.blur}px) grayscale(${filters.grayscale}%) sepia(${filters.sepia}%) invert(${filters.invert}%)`
  , [filters]);
  const transformCss = useMemo(() =>
    `rotate(${rotate}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1}) scale(${zoom / 100})`
  , [rotate, flipH, flipV, zoom]);

  const visibleOverlays = overlays.filter(o => current >= o.start && current <= o.end);

  // razor & cut actions
  const markIn = () => { pushHistory(); setInPoint(current); };
  const markOut = () => { pushHistory(); setOutPoint(current); };

  const razorAtPlayhead = () => {
    pushHistory();
    setRazorPoints(prev => [...prev, current].sort((a, b) => a - b));
    toast.success(`Razor @ ${fmtTime(current)}`);
  };

  const deleteBetweenInOut = () => {
    if (outPoint <= inPoint) { toast.error("Set IN < OUT first"); return; }
    pushHistory();
    setCuts(prev => normalizeCuts([...prev, { id: crypto.randomUUID(), start: inPoint, end: outPoint }], duration));
    toast.success(`Cut ${fmtTime(inPoint)} → ${fmtTime(outPoint)} removed`);
  };

  const deleteBetweenLastTwoRazors = () => {
    if (razorPoints.length < 2) { toast.error("Need at least 2 razor marks"); return; }
    const sorted = [...razorPoints].sort((a, b) => a - b);
    const b = sorted.pop()!; const a = sorted.pop()!;
    pushHistory();
    setRazorPoints(sorted);
    setCuts(prev => normalizeCuts([...prev, { id: crypto.randomUUID(), start: a, end: b }], duration));
    toast.success(`Cut ${fmtTime(a)} → ${fmtTime(b)} removed`);
  };

  const removeCut = (id: string) => { pushHistory(); setCuts(prev => prev.filter(c => c.id !== id)); };
  const clearCuts = () => { pushHistory(); setCuts([]); setRazorPoints([]); setSelection(null); };

  const deleteSelection = () => {
    if (!selection || !duration) { toast.error("Drag on waveform to select a region first"); return; }
    const s = Math.min(selection.start, selection.end);
    const e = Math.max(selection.start, selection.end);
    if (e - s < 0.01) { toast.error("Selection too small"); return; }
    pushHistory();
    setCuts(prev => normalizeCuts([...prev, { id: crypto.randomUUID(), start: s, end: e }], duration));
    setSelection(null);
    toast.success(`Cut ${fmtTime(s)} → ${fmtTime(e)} removed`);
  };

  // waveform zoom helpers
  const zoomWaveAt = (factor: number, anchorT?: number) => {
    const sc = waveScrollRef.current;
    const newZoom = Math.max(1, Math.min(50, waveZoom * factor));
    if (newZoom === waveZoom) return;
    if (sc && duration) {
      const anchor = anchorT ?? current;
      const ratio = newZoom / waveZoom;
      const targetX = (anchor / duration) * (sc.clientWidth * newZoom);
      requestAnimationFrame(() => {
        if (waveScrollRef.current) waveScrollRef.current.scrollLeft = targetX - sc.clientWidth / 2;
      });
      void ratio;
    }
    setWaveZoom(newZoom);
  };


  // overlays
  const addOverlay = () => {
    pushHistory();
    setOverlays(prev => [...prev, {
      id: crypto.randomUUID(), text: "New text", x: 50, y: 50, size: 32,
      color: "#ffffff", bg: "transparent",
      start: current, end: Math.min(duration, current + 3), bold: true,
    }]);
  };
  const updateOverlay = (id: string, patch: Partial<TextOverlay>) => setOverlays(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o));
  const removeOverlay = (id: string) => { pushHistory(); setOverlays(prev => prev.filter(o => o.id !== id)); };

  const snapshot = async () => {
    const v = videoRef.current; if (!v) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth; canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.filter = filterCss; ctx.drawImage(v, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `frame_${Math.round(current * 100)}.png`;
      a.click(); URL.revokeObjectURL(a.href);
    }, "image/png");
  };

  const enterFullscreen = () => containerRef.current?.requestFullscreen?.();
  const enterPip = async () => {
    const v = videoRef.current as any;
    if (v && document.pictureInPictureEnabled) { try { await v.requestPictureInPicture(); } catch {} }
  };

  const resetAll = () => { pushHistory(); setFilters({ ...FILTER_DEFAULTS }); setRotate(0); setFlipH(false); setFlipV(false); setZoom(100); };

  // ===== SAVE: ffmpeg.wasm → re-encode kept ranges → upload replacing original =====
  const saveEdited = async () => {
    if (!selected) return;
    if (!selected.bucket || !selected.path) { toast.error("Source URL not in Supabase storage — cannot overwrite"); return; }
    const ranges = keptRanges(cuts, duration);
    if (ranges.length === 0) { toast.error("Nothing kept — would produce empty video"); return; }
    if (cuts.length === 0) { toast.error("No cuts made — nothing to render"); return; }

    setSaving(true); setSaveProgress(0); setSaveMsg("Loading ffmpeg…");

    try {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { fetchFile, toBlobURL } = await import("@ffmpeg/util");
      const ffmpeg = new FFmpeg();
      ffmpeg.on("progress", ({ progress }) => setSaveProgress(Math.min(99, Math.round(progress * 100))));
      ffmpeg.on("log", ({ message }) => { if (message) console.log("[ffmpeg]", message); });

      const base = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
      await ffmpeg.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
      });

      setSaveMsg("Downloading source video…");
      await ffmpeg.writeFile("input.mp4", await fetchFile(selected.url));

      setSaveMsg(`Rendering ${ranges.length} kept range(s)…`);
      // Build trim+concat filter graph
      const parts = ranges.map((r, i) =>
        `[0:v]trim=start=${r.start.toFixed(3)}:end=${r.end.toFixed(3)},setpts=PTS-STARTPTS[v${i}];` +
        `[0:a]atrim=start=${r.start.toFixed(3)}:end=${r.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}];`
      ).join("");
      const concatIns = ranges.map((_, i) => `[v${i}][a${i}]`).join("");
      const filter = `${parts}${concatIns}concat=n=${ranges.length}:v=1:a=1[outv][outa]`;

      await ffmpeg.exec([
        "-i", "input.mp4",
        "-filter_complex", filter,
        "-map", "[outv]", "-map", "[outa]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        "out.mp4",
      ]);

      setSaveMsg("Uploading replacement…");
      const data = (await ffmpeg.readFile("out.mp4")) as Uint8Array;
      const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
      const blob = new Blob([ab], { type: "video/mp4" });

      const { error: upErr } = await supabase.storage
        .from(selected.bucket)
        .upload(selected.path, blob, { upsert: true, contentType: "video/mp4", cacheControl: "0" });
      if (upErr) throw upErr;

      // bump app_metadata updated_at so list reflects change + add edited marker
      const { data: existing } = await supabase
        .from("app_metadata")
        .select("value")
        .eq("key", `merge:${selected.script_id}`)
        .maybeSingle();
      const newValue = { ...(existing?.value as any || {}), edited_at: new Date().toISOString(), edit_cuts: cuts.length };
      await supabase
        .from("app_metadata")
        .update({ value: newValue, updated_at: new Date().toISOString() })
        .eq("key", `merge:${selected.script_id}`);

      setSaveProgress(100);
      setSaveMsg("Saved.");
      toast.success("Edited video saved — original replaced.");

      // refresh video element with cache-buster
      const newUrl = `${selected.url.split("?")[0]}?v=${Date.now()}`;
      setVideos(prev => prev.map(v => v.script_id === selected.script_id ? { ...v, url: newUrl, updated_at: new Date().toISOString() } : v));
      setCuts([]); setRazorPoints([]);

      try { ffmpeg.terminate(); } catch {}
    } catch (e: any) {
      console.error(e);
      toast.error(`Save failed: ${e?.message || e}`);
    } finally {
      setSaving(false);
      setTimeout(() => { setSaveProgress(0); setSaveMsg(""); }, 1500);
    }
  };

  const exportEditPlan = () => {
    if (!selected) return;
    const plan = {
      source: selected.url, title: selected.title, duration,
      filters, rotate, flipH, flipV, zoom,
      cuts, kept: keptRanges(cuts, duration), overlays, inPoint, outPoint,
    };
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `edit_${selected.script_id.slice(0, 8)}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA") return;
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      else if (e.key === "ArrowLeft") seek(current - (e.shiftKey ? 5 : 1));
      else if (e.key === "ArrowRight") seek(current + (e.shiftKey ? 5 : 1));
      else if (e.key === ",") stepFrame(-1);
      else if (e.key === ".") stepFrame(1);
      else if (e.key === "i") markIn();
      else if (e.key === "o") markOut();
      else if (e.key === "b") razorAtPlayhead();
      else if (e.key === "x") deleteBetweenInOut();
      else if (e.key === "m") setMuted(m => !m);
      else if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const totalCutSecs = normalizeCuts(cuts, duration).reduce((a, c) => a + (c.end - c.start), 0);
  const finalDur = Math.max(0, duration - totalCutSecs);

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold bg-fuchsia-500/15 text-fuchsia-600 px-1.5 py-0.5 rounded uppercase tracking-wider">Advanced</span>
            <span className="text-[10px] text-slate-400 font-medium tracking-wider">• VIDEO EDITOR</span>
          </div>
          <h1 className="text-2xl font-bold">Video Editor</h1>
          <p className="text-slate-500 text-sm">Razor • Waveform • Delete-between. Saves over the original — no duplicates.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={undo}><Undo2 className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" onClick={redo}><Redo2 className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" onClick={resetAll}><Eraser className="h-4 w-4 mr-1" />Reset FX</Button>
          <Button size="sm" variant="outline" onClick={exportEditPlan} disabled={!selected}><Download className="h-4 w-4 mr-1" />Plan JSON</Button>
          <Button size="sm" onClick={saveEdited} disabled={!selected || saving || cuts.length === 0}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            {saving ? `${saveProgress}%` : "Save (replace original)"}
          </Button>
        </div>
      </div>

      {saving && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs">
          <div className="flex justify-between mb-1"><span>{saveMsg}</span><span className="font-mono">{saveProgress}%</span></div>
          <div className="h-1.5 bg-indigo-100 rounded overflow-hidden">
            <div className="h-full bg-indigo-500 transition-all" style={{ width: `${saveProgress}%` }} />
          </div>
        </div>
      )}

      {/* Video picker */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center gap-3 flex-wrap">
        <Film className="h-4 w-4 text-slate-500" />
        <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Final Rendered Video</Label>
        <div className="flex-1 min-w-[260px]">
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger><SelectValue placeholder={loadingList ? "Loading…" : "Choose a merged video"} /></SelectTrigger>
            <SelectContent>
              {videos.map(v => (
                <SelectItem key={v.script_id} value={v.script_id}>
                  {v.title} — {new Date(v.updated_at).toLocaleDateString()}
                </SelectItem>
              ))}
              {!loadingList && videos.length === 0 && <div className="p-2 text-xs text-slate-500">No merged videos found.</div>}
            </SelectContent>
          </Select>
        </div>
        {selected && <a href={selected.url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 underline">open source</a>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        {/* Preview + Timeline */}
        <div className="space-y-3">
          <div ref={containerRef} className="relative bg-black rounded-2xl overflow-hidden flex items-center justify-center" style={{ aspectRatio: "16/9" }}>
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
                    try { v.currentTime = 0.05; } catch {}
                  }}
                  onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onError={() => toast.error("Video failed to load")}
                />
                <div className="absolute inset-0 pointer-events-none">
                  {visibleOverlays.map(o => (
                    <div key={o.id} className="absolute -translate-x-1/2 -translate-y-1/2 px-2 py-1 rounded"
                      style={{ left: `${o.x}%`, top: `${o.y}%`, color: o.color, background: o.bg, fontSize: o.size, fontWeight: o.bold ? 800 : 500, textShadow: "0 2px 8px rgba(0,0,0,0.6)" }}>
                      {o.text}
                    </div>
                  ))}
                </div>
                {!playing && (
                  <button onClick={togglePlay} className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-white/90 hover:bg-white text-black rounded-full p-5 shadow-2xl"><Play className="h-8 w-8" /></div>
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
              <Button size="icon" variant="outline" onClick={() => stepFrame(-1)}>⟨</Button>
              <Button size="icon" onClick={togglePlay}>{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Button>
              <Button size="icon" variant="outline" onClick={() => stepFrame(1)}>⟩</Button>
              <Button size="icon" variant="outline" onClick={() => seek(current + 5)}><FastForward className="h-4 w-4" /></Button>
              <Button size="icon" variant="outline" onClick={() => seek(duration)}><SkipForward className="h-4 w-4" /></Button>
              <div className="mx-2 text-xs font-mono text-slate-600">{fmtTime(current)} / {fmtTime(duration)}</div>
              <Button size="sm" variant={loop ? "default" : "outline"} onClick={() => setLoop(l => !l)}><Repeat className="h-4 w-4" /></Button>
              <Select value={String(rate)} onValueChange={(v) => setRate(parseFloat(v))}>
                <SelectTrigger className="w-[90px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4].map(r => <SelectItem key={r} value={String(r)}>{r}x</SelectItem>)}</SelectContent>
              </Select>
              <div className="flex items-center gap-2 ml-2">
                <Button size="icon" variant="outline" onClick={() => setMuted(m => !m)}>{muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</Button>
                <div className="w-24"><Slider value={[volume * 100]} min={0} max={100} step={1} onValueChange={(v) => setVolume(v[0] / 100)} /></div>
              </div>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={snapshot}><Camera className="h-4 w-4 mr-1" />Snap</Button>
                <Button size="sm" variant="outline" onClick={enterPip}><PictureInPicture2 className="h-4 w-4" /></Button>
                <Button size="sm" variant="outline" onClick={enterFullscreen}><Maximize2 className="h-4 w-4" /></Button>
              </div>
            </div>

            {/* Scrubber */}
            <Slider value={[current]} min={0} max={duration || 1} step={0.01} onValueChange={(v) => seek(v[0])} />

            {/* Waveform timeline: zoom + scroll + drag-select */}
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs">
                <Button size="sm" variant="outline" onClick={() => zoomWaveAt(0.5)} title="Zoom out">−</Button>
                <Button size="sm" variant="outline" onClick={() => zoomWaveAt(2)} title="Zoom in">+</Button>
                <Button size="sm" variant="outline" onClick={() => { setWaveZoom(1); if (waveScrollRef.current) waveScrollRef.current.scrollLeft = 0; }}>Fit</Button>
                <div className="w-40 ml-2">
                  <Slider value={[waveZoom]} min={1} max={50} step={0.5} onValueChange={(v) => setWaveZoom(v[0])} />
                </div>
                <span className="font-mono text-slate-500">{waveZoom.toFixed(1)}x</span>
                {selection && (
                  <span className="ml-auto font-mono text-amber-600">
                    Selection: {fmtTime(Math.min(selection.start, selection.end))} → {fmtTime(Math.max(selection.start, selection.end))}
                  </span>
                )}
              </div>
              <div
                ref={waveScrollRef}
                className="relative overflow-x-auto overflow-y-hidden rounded-md border border-slate-200"
                onWheel={(e) => {
                  if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    zoomWaveAt(e.deltaY < 0 ? 1.2 : 1 / 1.2);
                  }
                }}
              >
                <canvas
                  ref={waveCanvasRef}
                  style={{ width: `${waveZoom * 100}%`, height: "80px", display: "block" }}
                  className="cursor-crosshair select-none"
                  onMouseDown={(e) => {
                    if (!duration) return;
                    const cvs = e.currentTarget;
                    const rect = cvs.getBoundingClientRect();
                    const pct = (e.clientX - rect.left) / rect.width;
                    const t = pct * duration;
                    if (e.shiftKey) {
                      dragRef.current = { startX: e.clientX, startT: t };
                      setSelection({ start: t, end: t });
                    } else {
                      seek(t);
                    }
                  }}
                  onMouseMove={(e) => {
                    if (!dragRef.current || !duration) return;
                    const cvs = e.currentTarget;
                    const rect = cvs.getBoundingClientRect();
                    const pct = (e.clientX - rect.left) / rect.width;
                    const t = Math.max(0, Math.min(duration, pct * duration));
                    setSelection({ start: dragRef.current.startT, end: t });
                  }}
                  onMouseUp={() => { dragRef.current = null; }}
                  onMouseLeave={() => { dragRef.current = null; }}
                  onDoubleClick={() => setSelection(null)}
                />
                <div className="sticky top-1 right-2 float-right text-[10px] text-slate-500 bg-white/80 px-1.5 rounded mr-1 mt-1">
                  {waveLoading ? "decoding…" : wavePeaks ? "waveform" : "no audio"}
                </div>
              </div>
              <p className="text-[10px] text-slate-400">Tip: Click = seek · Shift+Drag = select region · Ctrl/Cmd+Wheel = zoom · Double-click = clear selection</p>
            </div>


            {/* Razor / cut toolbar */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <Button size="sm" variant="outline" onClick={markIn}><span className="text-green-600 font-bold mr-1">[</span>IN (i)</Button>
              <Button size="sm" variant="outline" onClick={markOut}>OUT (o)<span className="text-red-600 font-bold ml-1">]</span></Button>
              <Button size="sm" variant="outline" onClick={razorAtPlayhead} title="Razor (b)">
                <Scissors className="h-3 w-3 mr-1" />Razor (b)
              </Button>
              <Button size="sm" variant="destructive" onClick={deleteBetweenInOut} title="Delete IN→OUT (x)">
                <Trash2 className="h-3 w-3 mr-1" />Delete IN→OUT
              </Button>
              <Button size="sm" variant="outline" onClick={deleteBetweenLastTwoRazors} disabled={razorPoints.length < 2}>
                Delete between last 2 razors
              </Button>
              {(cuts.length > 0 || razorPoints.length > 0) && (
                <Button size="sm" variant="ghost" onClick={clearCuts}><Eraser className="h-3 w-3 mr-1" />Clear cuts</Button>
              )}
              <span className="font-mono text-slate-500 ml-auto">
                IN {fmtTime(inPoint)} · OUT {fmtTime(outPoint)} · Final {fmtTime(finalDur)}
              </span>
            </div>
          </div>

          {/* Cuts list */}
          {cuts.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Cuts to remove ({cuts.length})</div>
                <div className="text-xs text-slate-500">Total removed: <span className="font-mono">{fmtTime(totalCutSecs)}</span></div>
              </div>
              <div className="space-y-1.5">
                {normalizeCuts(cuts, duration).map((s, i) => (
                  <div key={s.id} className="flex items-center gap-2 text-xs">
                    <span className="w-6 text-slate-400">#{i + 1}</span>
                    <span className="font-mono text-red-600">{fmtTime(s.start)} → {fmtTime(s.end)}</span>
                    <span className="text-slate-400">({(s.end - s.start).toFixed(2)}s)</span>
                    <Button size="sm" variant="ghost" onClick={() => seek(s.start)}>Goto</Button>
                    <Button size="sm" variant="ghost" onClick={() => removeCut(s.id)}><Trash2 className="h-3 w-3 text-red-500" /></Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <Tabs defaultValue="filters">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="filters"><Sparkles className="h-3.5 w-3.5 mr-1" />FX</TabsTrigger>
              <TabsTrigger value="transform"><RotateCw className="h-3.5 w-3.5 mr-1" />Xform</TabsTrigger>
              <TabsTrigger value="text"><Type className="h-3.5 w-3.5 mr-1" />Text</TabsTrigger>
              <TabsTrigger value="info">Info</TabsTrigger>
            </TabsList>

            <TabsContent value="filters" className="space-y-3 mt-3">
              {([["brightness",0,200],["contrast",0,200],["saturate",0,200],["hue",0,360],["blur",0,20],["grayscale",0,100],["sepia",0,100],["invert",0,100]] as const).map(([k, min, max]) => (
                <div key={k}>
                  <div className="flex justify-between text-xs mb-1"><span className="capitalize">{k}</span><span className="font-mono text-slate-500">{(filters as any)[k]}</span></div>
                  <Slider value={[(filters as any)[k]]} min={min} max={max} step={1} onValueChange={(v) => setFilters(f => ({ ...f, [k]: v[0] }))} onValueCommit={pushHistory} />
                </div>
              ))}
              <Button size="sm" variant="outline" className="w-full" onClick={() => { pushHistory(); setFilters({ ...FILTER_DEFAULTS }); }}>Reset Filters</Button>
              <p className="text-[10px] text-slate-400">Note: filters are preview-only; Save only bakes razor cuts into the file.</p>
            </TabsContent>

            <TabsContent value="transform" className="space-y-3 mt-3">
              <div>
                <div className="flex justify-between text-xs mb-1"><span>Rotate</span><span className="font-mono">{rotate}°</span></div>
                <Slider value={[rotate]} min={-180} max={180} step={1} onValueChange={(v) => setRotate(v[0])} onValueCommit={pushHistory} />
                <div className="flex gap-1 mt-2">{[0,90,180,270].map(d => <Button key={d} size="sm" variant="outline" onClick={() => { pushHistory(); setRotate(d); }}>{d}°</Button>)}</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant={flipH ? "default" : "outline"} className="flex-1" onClick={() => { pushHistory(); setFlipH(f => !f); }}><FlipHorizontal className="h-4 w-4 mr-1" />Flip H</Button>
                <Button size="sm" variant={flipV ? "default" : "outline"} className="flex-1" onClick={() => { pushHistory(); setFlipV(f => !f); }}><FlipVertical className="h-4 w-4 mr-1" />Flip V</Button>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1"><span>Zoom</span><span className="font-mono">{zoom}%</span></div>
                <Slider value={[zoom]} min={10} max={300} step={1} onValueChange={(v) => setZoom(v[0])} onValueCommit={pushHistory} />
              </div>
            </TabsContent>

            <TabsContent value="text" className="space-y-3 mt-3">
              <Button size="sm" className="w-full" onClick={addOverlay} disabled={!selected}><Plus className="h-4 w-4 mr-1" />Add text @ {fmtTime(current)}</Button>
              <div className="space-y-3 max-h-[420px] overflow-y-auto">
                {overlays.map(o => (
                  <div key={o.id} className="rounded-xl border border-slate-200 p-3 space-y-2">
                    <Input value={o.text} onChange={(e) => updateOverlay(o.id, { text: e.target.value })} />
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><Label className="text-[10px]">X%</Label><Input type="number" value={o.x} onChange={(e) => updateOverlay(o.id, { x: +e.target.value })} /></div>
                      <div><Label className="text-[10px]">Y%</Label><Input type="number" value={o.y} onChange={(e) => updateOverlay(o.id, { y: +e.target.value })} /></div>
                      <div><Label className="text-[10px]">Size</Label><Input type="number" value={o.size} onChange={(e) => updateOverlay(o.id, { size: +e.target.value })} /></div>
                      <div><Label className="text-[10px]">Color</Label><input type="color" value={o.color} onChange={(e) => updateOverlay(o.id, { color: e.target.value })} className="w-full h-9 rounded" /></div>
                      <div><Label className="text-[10px]">Start (s)</Label><Input type="number" step="0.1" value={o.start} onChange={(e) => updateOverlay(o.id, { start: +e.target.value })} /></div>
                      <div><Label className="text-[10px]">End (s)</Label><Input type="number" step="0.1" value={o.end} onChange={(e) => updateOverlay(o.id, { end: +e.target.value })} /></div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => updateOverlay(o.id, { bold: !o.bold })}>{o.bold ? "Bold ✓" : "Bold"}</Button>
                      <Button size="sm" variant="ghost" className="ml-auto" onClick={() => removeOverlay(o.id)}><Trash2 className="h-3 w-3 text-red-500" /></Button>
                    </div>
                  </div>
                ))}
                {overlays.length === 0 && <p className="text-xs text-slate-400 text-center py-4">No text overlays</p>}
              </div>
            </TabsContent>

            <TabsContent value="info" className="space-y-2 mt-3 text-xs">
              <div className="rounded-lg bg-slate-50 p-3 space-y-1">
                <div><b>Source:</b> {selected?.title || "—"}</div>
                <div><b>Bucket/Path:</b> <span className="font-mono">{selected?.bucket || "—"}/{selected?.path || ""}</span></div>
                <div><b>Original duration:</b> {fmtTime(duration)}</div>
                <div><b>Removed:</b> {fmtTime(totalCutSecs)} · <b>Final:</b> {fmtTime(finalDur)}</div>
                <div><b>Cuts:</b> {cuts.length} · <b>Razor marks:</b> {razorPoints.length}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 space-y-1">
                <p className="font-bold mb-1">Workflow</p>
                <div>1. Pick video → scrub on waveform.</div>
                <div>2. Mark IN (i) and OUT (o) around bad part.</div>
                <div>3. Click <b>Delete IN→OUT</b> (or use Razor x2 then Delete-between).</div>
                <div>4. Repeat for all cuts.</div>
                <div>5. Click <b>Save</b> — original file is overwritten in storage.</div>
              </div>
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-900">
                Save runs ffmpeg in your browser and uploads the result back to the same storage path. The old file is replaced — no duplicates.
              </div>
              <div className="rounded-lg bg-slate-50 p-3 space-y-1">
                <p className="font-bold mb-1">Shortcuts</p>
                <div><kbd>Space</kbd> play/pause · <kbd>← →</kbd> seek · <kbd>, .</kbd> frame</div>
                <div><kbd>I / O</kbd> mark IN / OUT · <kbd>B</kbd> razor · <kbd>X</kbd> delete IN→OUT</div>
                <div><kbd>M</kbd> mute · <kbd>Ctrl+Z / Y</kbd> undo / redo</div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
