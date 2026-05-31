import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { 
  Play, 
  Settings, 
  Clock, 
  ChevronRight, 
  Activity, 
  Zap, 
  RefreshCw,
  MoreVertical,
  CheckCircle2,
  Circle,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { WatchdogControl } from "@/components/WatchdogControl";
import { cn } from "@/lib/utils";
import { runIdeaEngine, updateLastRunTimestamp, getAutoRunSettings } from "@/lib/engine.functions";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_dashboard/pipeline")({
  component: PipelinePage,
});

function PipelinePage() {
  const qc = useQueryClient();
  const runFn = useServerFn(runIdeaEngine);
  const setLastRun = useServerFn(updateLastRunTimestamp);

  const { data: settings } = useQuery({
    queryKey: ["auto-run-settings"],
    queryFn: () => useServerFn(getAutoRunSettings)(),
  });

  const run = useMutation({
    mutationFn: () => runFn(),
    onSuccess: (res) => {
      toast.success(`Processed ${res.processed} new ideas.`);
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["ideas"] });
      setLastRun();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const stages = [
    { id: "1", name: "Scripting", status: "completed", time: "2m ago" },
    { id: "2", name: "Chunking", status: "completed", time: "1m ago" },
    { id: "3", name: "Audio", status: "active", time: "Just now" },
    { id: "4", name: "Slides", status: "pending", time: "-" },
    { id: "5", name: "Annotations", status: "pending", time: "-" },
    { id: "6", name: "Rendering", status: "pending", time: "-" },
  ];

  return (
    <div className="p-8 space-y-8">
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded uppercase tracking-wider">Control Center</span>
            <span className="text-[10px] text-slate-400 font-medium tracking-wider">• WATCHDOG ACTIVE</span>
          </div>
          <h1 className="text-3xl font-bold text-white">Pipeline Engine</h1>
          <p className="text-slate-500 mt-1">Automated competitor monitoring and content generation.</p>
        </div>

        <WatchdogControl variant="compact" />
        <Button 
          onClick={() => run.mutate()} 
          disabled={run.isPending}
          className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 h-11 px-6 gap-2 rounded-2xl"
        >
          {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
          Manual Run
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
            <div className="p-6 border-b flex justify-between items-center">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Activity className="h-4 w-4 text-indigo-500" />
                Live Pipeline Status
              </h3>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "flex h-2 w-2 rounded-full",
                  settings?.enabled ? "bg-emerald-500 animate-pulse" : "bg-slate-300"
                )} />
                <span className={cn(
                  "text-[11px] font-bold uppercase",
                  settings?.enabled ? "text-emerald-600" : "text-slate-400"
                )}>
                  {settings?.enabled ? "Watchdog Active" : "Watchdog Inactive"}
                </span>
              </div>
            </div>
            <div className="p-0">
              {stages.map((stage, idx) => (
                <div key={stage.id} className={cn(
                  "flex items-center justify-between p-4 hover:bg-slate-50/50 transition-colors border-b last:border-0",
                  stage.status === "active" && "bg-indigo-50/30"
                )}>
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                      stage.status === "completed" ? "bg-emerald-100 text-emerald-600" :
                      stage.status === "active" ? "bg-indigo-600 text-white animate-pulse" :
                      "bg-slate-100 text-slate-400"
                    )}>
                      {stage.status === "completed" ? <CheckCircle2 className="h-4 w-4" /> : stage.id}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-white">{stage.name} Engine</div>
                      <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{stage.time}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {stage.status === "active" && (
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce" />
                      </div>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-indigo-600 rounded-3xl p-6 text-white shadow-xl shadow-indigo-100 relative overflow-hidden group">
            <Zap className="absolute -right-4 -bottom-4 h-32 w-32 text-white/10 group-hover:scale-110 transition-transform duration-500" />
            <div className="relative z-10">
              <h3 className="text-lg font-bold mb-2">Watchdog Status</h3>
              <p className="text-indigo-100 text-sm mb-4 leading-relaxed">
                {settings?.enabled 
                  ? `Monitoring competitor channels every ${settings.interval_hrs} hour(s) for new high-performing content.`
                  : "Watchdog is currently disabled. Enable it to automate content discovery."}
              </p>
              <div className="flex items-center gap-2 bg-white/10 rounded-xl p-3 border border-white/10">
                <RefreshCw className={cn("h-4 w-4 text-indigo-200", run.isPending && "animate-spin")} />
                <span className="text-xs font-bold tracking-wide">
                  Last check: {settings?.last_run ? `${formatDistanceToNow(new Date(settings.last_run))} ago` : "Never"}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border shadow-sm p-6">
            <h3 className="font-bold text-white mb-4">Quick Stats</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500 font-medium">Videos Found Today</span>
                <span className="text-sm font-bold text-white">3</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500 font-medium">Scripts Generated</span>
                <span className="text-sm font-bold text-white">12</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500 font-medium">Storage Used</span>
                <span className="text-sm font-bold text-white">4.2 GB</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

