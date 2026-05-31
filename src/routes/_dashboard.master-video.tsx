import { createFileRoute } from "@tanstack/react-router";
import { Play, Download, Share2, FileVideo, Activity, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_dashboard/master-video")({
  component: MasterVideoPage,
});

function MasterVideoPage() {
  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded uppercase tracking-wider">Phase 6</span>
            <span className="text-[10px] text-slate-400 font-medium tracking-wider">• RENDERING ENGINE</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Master Video</h1>
          <p className="text-slate-500 mt-1">Final assembly and high-definition rendering.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="border-slate-200 gap-2 h-11 rounded-2xl">
            <Share2 className="h-4 w-4" />
            Share
          </Button>
          <Button className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 px-6 gap-2 h-11 rounded-2xl">
            <Download className="h-4 w-4" />
            Export 4K
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="aspect-video bg-slate-900 rounded-[2.5rem] shadow-2xl overflow-hidden relative group cursor-pointer border-[8px] border-white">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Play className="h-8 w-8 text-white fill-current" />
              </div>
            </div>
            <div className="absolute bottom-6 left-6 right-6">
              <div className="flex justify-between items-end">
                <div>
                  <h3 className="text-white font-bold text-lg">Final_Assembly_v1.mp4</h3>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">4K • 60FPS • 02:45</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  {[...Array(20)].map((_, i) => (
                    <div key={i} className="w-1 bg-white/30 rounded-full" style={{ height: `${Math.random() * 20 + 5}px` }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-3xl border shadow-sm p-6 space-y-4">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Activity className="h-4 w-4 text-indigo-500" />
              Render Logs
            </h3>
            <div className="space-y-4">
              {[
                { label: "Audio Mixdown", status: "Completed", time: "2m ago" },
                { label: "Visual Syncing", status: "Completed", time: "1m ago" },
                { label: "Metadata Injection", status: "In Progress", time: "now" }
              ].map((log, i) => (
                <div key={i} className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${log.status === "Completed" ? "bg-emerald-500" : "bg-indigo-500 animate-pulse"}`} />
                    <span className="text-slate-600 font-medium">{log.label}</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">{log.time}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-indigo-50 border border-indigo-100 rounded-3xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                <Clock className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-indigo-400 uppercase">Estimated Time</div>
                <div className="font-bold text-indigo-900">1m 24s</div>
              </div>
            </div>
            <div className="w-full bg-white rounded-full h-2 overflow-hidden">
              <div className="bg-indigo-600 h-full w-[65%] rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}