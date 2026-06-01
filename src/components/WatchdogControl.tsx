import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAutoRunSettings, updateAutoRunSettings } from "@/lib/engine.functions";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Clock, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  variant?: "compact" | "full";
}

export function WatchdogControl({ className, variant = "full" }: Props) {
  const qc = useQueryClient();
  const [localInterval, setLocalInterval] = useState<number[]>([1]);
  const [localVideos, setLocalVideos] = useState<number[]>([10]);

  const getSettings = useServerFn(getAutoRunSettings);
  const updateSettings = useServerFn(updateAutoRunSettings);

  const { data: settings } = useQuery({
    queryKey: ["auto-run-settings"],
    queryFn: async () => {
      const data = await getSettings();
      setLocalInterval([data.interval_hrs]);
      setLocalVideos([data.videos_per_run ?? 10]);
      return data;
    },
  });

  const update = useMutation({
    mutationFn: (vars: { enabled: boolean; interval_hrs: number; videos_per_run?: number }) =>
      updateSettings({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["auto-run-settings"] });
    },
  });

  const handleToggle = (val: boolean) => {
    update.mutate({
      enabled: val,
      interval_hrs: settings?.interval_hrs ?? 1,
      videos_per_run: settings?.videos_per_run ?? 10,
    }, {
      onSuccess: () => {
        if (val) {
          toast.success("Watchdog turned On", {
            description: `Auto-scraping every ${settings?.interval_hrs ?? 1}h · ${settings?.videos_per_run ?? 10} videos/channel`,
          });
        } else {
          toast.info("Watchdog turned Off");
        }
      },
      onError: (err: any) => {
        toast.error("Failed to update settings: " + err.message);
      }
    });
  };

  const handleIntervalChange = (hrs: number) => {
    update.mutate({
      enabled: settings?.enabled ?? false,
      interval_hrs: hrs,
      videos_per_run: settings?.videos_per_run ?? 10,
    });
  };

  const handleVideosChange = (n: number) => {
    update.mutate({
      enabled: settings?.enabled ?? false,
      interval_hrs: settings?.interval_hrs ?? 1,
      videos_per_run: n,
    });
  };

  const enabled = settings?.enabled ?? false;

  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border", className)}>
        <div className="flex flex-col items-end gap-1">
          <div 
            className="flex items-center gap-3 cursor-pointer" 
            onClick={() => handleToggle(!enabled)}
          >
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Watchdog</span>
            <Switch
              checked={enabled}
              onCheckedChange={handleToggle}
              className="data-[state=checked]:bg-indigo-600 pointer-events-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-3 w-3 text-slate-400" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] font-bold text-slate-500 hover:text-indigo-600 px-0">
                  {settings?.interval_hrs}hr <ChevronRight className="h-2 w-2 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {[1, 2, 6, 12, 24].map((h) => (
                  <DropdownMenuItem key={h} onClick={() => handleIntervalChange(h)}>
                    Every {h} hr{h > 1 ? "s" : ""}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-4 sm:gap-6 bg-white/5 p-3 sm:p-4 rounded-2xl border border-white/5 shadow-2xl shadow-black/20", className)}>
      <div className="flex flex-col gap-2 min-w-[100px] sm:min-w-[120px]">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Interval</span>
          <span className="text-[10px] font-bold text-indigo-400">{localInterval[0]} hrs</span>
        </div>
        <Slider
          value={localInterval}
          onValueChange={setLocalInterval}
          onValueCommit={(v) => handleIntervalChange(v[0])}
          min={1}
          max={24}
          step={1}
          className="w-full"
        />
      </div>

      <div className="h-8 w-px bg-white/5" />

      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Auto Run</span>
        <div 
          className="flex items-center gap-3 cursor-pointer group" 
          onClick={() => handleToggle(!enabled)}
        >
          <Switch
            id="autorun-switch"
            checked={enabled}
            onCheckedChange={handleToggle}
            className="data-[state=checked]:bg-emerald-500 pointer-events-none transition-all group-hover:scale-110"
          />
          <span className={cn("text-[10px] font-bold uppercase tracking-widest transition-colors", enabled ? "text-emerald-500" : "text-slate-300 group-hover:text-slate-500")}>
            {enabled ? "Active" : "Off"}
          </span>
        </div>
      </div>
    </div>
  );
}