import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, FileVideo, RefreshCw, Film, Calendar, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MasterVideoEditor } from "@/components/MasterVideoEditor";


export const Route = createFileRoute("/_dashboard/master-video")({
  component: MasterVideoPage,
});

type MegaRow = {
  script_id: string;
  title: string;
  status: string;
  url: string | null;
  error: string | null;
  clip_count?: number;
  slide_source?: string;
  updated_at: string;
};

function MasterVideoPage() {
  const [rows, setRows] = useState<MegaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<MegaRow | null>(null);


  const load = async () => {
    setLoading(true);
    try {
      const { data: meta, error } = await supabase
        .from("app_metadata")
        .select("key, value, updated_at")
        .like("key", "merge:%")
        .order("updated_at", { ascending: false });
      if (error) throw error;

      const scriptIds = (meta || [])
        .map((m: any) => String(m.key).replace("merge:", ""))
        .filter(Boolean);

      let titleMap: Record<string, string> = {};
      if (scriptIds.length) {
        const { data: scripts } = await supabase
          .from("scripts")
          .select("id, title")
          .in("id", scriptIds);
        titleMap = Object.fromEntries(
          (scripts || []).map((s: any) => [s.id, s.title || "Untitled script"])
        );
      }

      const built: MegaRow[] = (meta || []).map((m: any) => {
        const sid = String(m.key).replace("merge:", "");
        const v = m.value || {};
        return {
          script_id: sid,
          title: titleMap[sid] || `Script ${sid.slice(0, 8)}`,
          status: v.status || "unknown",
          url: v.url || null,
          error: v.error || null,
          clip_count: v.clip_count,
          slide_source: v.slide_source,
          updated_at: m.updated_at,
        };
      });

      setRows(built);
    } catch (e: any) {
      toast.error(`Failed to load mega videos: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const i = setInterval(load, 8000);
    return () => clearInterval(i);
  }, []);

  const downloadOriginal = async (row: MegaRow) => {
    if (!row.url) return;
    setDownloading(row.script_id);
    try {
      // Fetch the original MP4 bytes (no re-encode → best possible quality
      // identical to source on Supabase Storage) and trigger a browser save.
      const res = await fetch(row.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const safeTitle = row.title.replace(/[^a-z0-9_\- ]/gi, "_").slice(0, 60);
      a.download = `${safeTitle || "mega"}_${row.script_id.slice(0, 8)}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      toast.success("Download started");
    } catch (e: any) {
      toast.error(`Download failed: ${e.message}`);
      // Fallback: open in new tab so the user can right-click → Save As
      window.open(row.url!, "_blank");
    } finally {
      setDownloading(null);
    }
  };

  const done = rows.filter((r) => r.status === "done" && r.url);
  const pending = rows.filter((r) => r.status !== "done" || !r.url);

  if (editingRow) {
    return (
      <MasterVideoEditor
        videoUrl={editingRow.url!}
        title={editingRow.title}
        onBack={() => setEditingRow(null)}
        onSave={(data) => {
          console.log("Saving edit state:", data);
          setEditingRow(null);
        }}
      />
    );
  }

  return (

    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold bg-indigo-500/15 text-indigo-300 px-1.5 py-0.5 rounded uppercase tracking-wider">
              Phase 6
            </span>
            <span className="text-[10px] text-slate-400 font-medium tracking-wider">
              • MASTER VIDEO LIBRARY
            </span>
          </div>
          <h1 className="text-3xl font-bold text-white">Master Video</h1>
          <p className="text-slate-500 mt-1">
            Every merged mega video. Click download for the original full-quality MP4.
          </p>
        </div>
        <Button
          onClick={load}
          variant="outline"
          className="border-slate-700 text-slate-200 gap-2 h-11 rounded-2xl"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {loading && rows.length === 0 && (
        <div className="text-slate-500 text-sm">Loading mega videos…</div>
      )}

      {!loading && rows.length === 0 && (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-10 text-center">
          <FileVideo className="h-10 w-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-300 font-semibold">No mega videos yet</p>
          <p className="text-slate-500 text-sm mt-1">
            Go to the Annotations page and click <b>Merge Mega Video</b> to build one.
          </p>
        </div>
      )}

      {done.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
            Ready ({done.length})
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {done.map((row) => (
              <div
                key={row.script_id}
                className="rounded-3xl bg-slate-900/60 border border-slate-800 overflow-hidden shadow-xl"
              >
                <div className="aspect-video bg-black">
                  <video
                    src={row.url!}
                    controls
                    preload="metadata"
                    className="w-full h-full"
                  />
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <h3 className="font-bold text-white text-lg leading-tight line-clamp-2">
                      {row.title}
                    </h3>
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <Film className="h-3 w-3" />
                        {row.clip_count ?? "?"} clips
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(row.updated_at).toLocaleString()}
                      </span>
                      {row.slide_source && (
                        <span className="uppercase tracking-wider font-semibold text-indigo-300">
                          {row.slide_source}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => downloadOriginal(row)}
                      disabled={downloading === row.script_id}
                      className="bg-indigo-600 hover:bg-indigo-700 gap-2 flex-1 h-11 rounded-2xl"
                    >
                      <Download className="h-4 w-4" />
                      {downloading === row.script_id ? "Preparing…" : "Download MP4"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setEditingRow(row)}
                      className="border-slate-700 text-slate-200 gap-2 w-full h-11 rounded-2xl"
                    >
                      <Edit2 className="h-4 w-4" />
                      Edit
                    </Button>
                    <a href={row.url!} target="_blank" rel="noreferrer" className="flex-1">
                      <Button
                        variant="outline"
                        className="border-slate-700 text-slate-200 gap-2 w-full h-11 rounded-2xl"
                      >
                        Open
                      </Button>
                    </a>

                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Original render: 1920×1080 · H.264 · AAC — downloaded as-is, no
                    re-encode, so quality is identical to the source file.
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
            In progress / errored ({pending.length})
          </h2>
          <div className="space-y-2">
            {pending.map((row) => (
              <div
                key={row.script_id}
                className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 flex items-center justify-between"
              >
                <div>
                  <p className="text-white font-semibold text-sm">{row.title}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Status: <span className="font-bold uppercase tracking-wider">{row.status}</span>
                    {row.error ? ` — ${row.error}` : ""}
                  </p>
                </div>
                <span className="text-[10px] text-slate-500">
                  {new Date(row.updated_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
