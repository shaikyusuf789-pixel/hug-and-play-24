import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import {
  Check,
  Star,
  Loader2,
  Inbox,
  RefreshCw,
  Sparkles,
  LayoutGrid,
} from "lucide-react";
import { Button } from "@/components/ui/button";

import { toast } from "sonner";
import { getIdeas, updateIdeaStatus, approveAndProcessIdea } from "@/lib/engine.functions";
import { IdeaCardView, type ActionKey, type IdeaCard } from "@/components/IdeaCardView";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_dashboard/idea-cards")({
  component: RawContentPage,
  head: () => ({ meta: [{ title: "Idea Cards — SKY Studio" }] }),
});

const TABS: {
  key: string;
  label: string;
  icon: any;
  actions: ActionKey[];
}[] = [
  { key: "Pending", label: "Pending", icon: Inbox, actions: ["approve", "reject"] },
  { key: "Approved", label: "Approved", icon: Check, actions: ["priority", "reject", "generate"] },
  { key: "Priority", label: "Priority", icon: Star, actions: ["reject", "generate"] },
];

const PAGE_SIZE = 12;

const ACTION_TO_STATUS: Record<Exclude<ActionKey, "generate">, string> = {
  approve: "Approved",
  reject: "Rejected",
  priority: "Priority",
  done: "Done",
};

function RawContentPage() {
  const navigate = useNavigate();
  const fetchFn = useServerFn(getIdeas);
  const updateFn = useServerFn(updateIdeaStatus);
  const approveFn = useServerFn(approveAndProcessIdea);
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState("Pending");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const { data: ideasData, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["ideas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("raw_content")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return { ideas: data || [] };
    },
  });

  const ideas = useMemo(() => {
    const list = (ideasData?.ideas || []) as IdeaCard[];
    console.log("[IdeaCards] Raw ideas from server:", list.length);
    return list;
  }, [ideasData]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      Pending: 0,
      Approved: 0,
      Priority: 0,
      Rejected: 0,
      Done: 0,
    };
    ideas.forEach(i => {
      if (c[i.status] !== undefined) c[i.status]++;
    });
    return c;
  }, [ideas]);

  const filtered = useMemo(
    () => ideas.filter((i) => i.status === activeTab),
    [ideas, activeTab]
  );

  // Helper: optimistically patch an idea in the cache
  const patchIdea = (id: string, patch: Partial<IdeaCard>) => {
    qc.setQueryData(["ideas"], (old: any) => {
      if (!old?.ideas) return old;
      return {
        ...old,
        ideas: old.ideas.map((i: IdeaCard) => (i.id === id ? { ...i, ...patch } : i)),
      };
    });
  };

  const mutate = useMutation({
    mutationFn: (vars: { idea: IdeaCard; status: string }) =>
      updateFn({ data: { id: vars.idea.id, status: vars.status } }),
    onMutate: (vars) => {
      patchIdea(vars.idea.id, { status: vars.status } as any);
    },
    onSuccess: () => {
      toast.success("Updated status successfully");
    },
    onError: (e: any) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: ["ideas"] });
    },
  });

  const handleAction = async (action: ActionKey, idea: IdeaCard) => {
    if (action === "generate") {
      navigate({
        to: "/script-generator",
        search: {
          transcript: idea.original_summary || "",
          topic: idea.proposed_title || idea.original_title || "",
          ideaId: idea.id,
        },
      });
      return;
    }

    if (action === "approve") {
      // Move card instantly to Approved with stage 1 marker
      patchIdea(idea.id, { status: "Approved", processing_step: "transcript_pending" } as any);
      try {
        await approveFn({ data: { id: idea.id } });
        qc.invalidateQueries({ queryKey: ["ideas"] });
      } catch (err: any) {
        toast.error(err.message);
        patchIdea(idea.id, { processing_step: "failed" } as any);
      }
      return;
    }

    const status = ACTION_TO_STATUS[action];
    mutate.mutate({ idea, status });
  };


  return (
    <div className="mx-auto max-w-5xl space-y-6 md:space-y-8 p-4 md:p-6">
      <header className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl md:rounded-2xl bg-primary shadow-lg shadow-primary/20 text-white">
            <LayoutGrid className="h-5 w-5 md:h-6 md:w-6" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900">Idea Cards</h1>
            <p className="text-[10px] md:text-sm font-medium text-slate-500 uppercase tracking-widest mt-0.5">Content Intelligence Pipeline</p>
          </div>
        </div>
        <Button
          onClick={() => refetch()}
          disabled={isFetching}
          variant="outline"
          className="h-10 md:h-11 gap-2 rounded-xl font-bold border-slate-200 text-sm"
        >
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </header>

      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                "flex items-center gap-2 rounded-xl md:rounded-2xl px-4 md:px-5 py-2.5 md:py-3 text-[10px] md:text-xs font-bold uppercase tracking-wider transition-all border shrink-0",
                active
                  ? "bg-primary border-primary text-white shadow-lg shadow-primary/20"
                  : "bg-white border-slate-100 text-slate-500 hover:border-primary/30 hover:text-primary"
              )}
            >
              <Icon className="h-3.5 w-3.5 md:h-4 md:w-4" />
              {t.label}
              <span className={cn(
                "ml-1 rounded-lg px-1.5 md:px-2 py-0.5 text-[9px] md:text-[10px] font-black",
                active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400"
              )}>
                {counts[t.key]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-6">
        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-64 rounded-[2rem] bg-white border border-slate-100 animate-pulse shadow-sm" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[2.5rem] md:rounded-[3rem] bg-white border border-dashed border-slate-200 py-16 md:py-24 text-center px-6">
            <div className="flex h-16 w-16 md:h-20 md:w-20 items-center justify-center rounded-[1.5rem] md:rounded-3xl bg-slate-50 text-slate-300 mb-6">
              <Sparkles className="h-8 w-8 md:h-10 md:w-10" />
            </div>
            <h3 className="text-lg md:text-xl font-black text-slate-900">No {activeTab.toLowerCase()} ideas</h3>
            <p className="mt-2 text-sm md:text-base text-slate-500 font-medium">Your {activeTab.toLowerCase()} queue is empty.</p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            {filtered.map((idea) => (
              <IdeaCardView
                key={idea.id}
                idea={idea}
                actions={TABS.find(t => t.key === activeTab)?.actions || []}
                onAction={handleAction}
                pending={mutate.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
