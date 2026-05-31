import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import {
  Check,
  X,
  Star,
  Loader2,
  GraduationCap,
  Inbox,
  CheckCircle2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { getIdeas, updateIdeaStatus, approveAndProcessIdea } from "@/lib/engine.functions";
import { IdeaCardView, type ActionKey, type IdeaCard } from "@/components/IdeaCardView";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_dashboard/idea-cards")({
  component: RawContentPage,
  head: () => ({ meta: [{ title: "Idea Reels — Sky Intel" }] }),
});

const TABS: {
  key: string;
  label: string;
  icon: typeof Inbox;
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

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["ideas"],
    queryFn: () => fetchFn({ data: {} }),
  });

  // Realtime subscription for live updates
  useEffect(() => {
    const channel = supabase
      .channel('raw_content_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'raw_content'
        },
        (payload) => {
          console.log('Change received!', payload);
          qc.invalidateQueries({ queryKey: ["ideas"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const ideas = (data?.ideas || []) as IdeaCard[];

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      Pending: 0,
      Approved: 0,
      Priority: 0,
      Rejected: 0,
      Done: 0,
    };
    
    ideas.forEach(i => {
      let status = i.status;
      if (status === "Processing") status = "Approved";
      if (c[status] !== undefined) {
        c[status]++;
      }
    });
    
    return c;
  }, [ideas]);

  const filtered = useMemo(
    () => ideas.filter((i) => {
      if (activeTab === "Approved") return i.status === "Approved" || i.status === "Processing";
      return i.status === activeTab;
    }),
    [ideas, activeTab]
  );

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeTab]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((c) =>
            c < filtered.length ? Math.min(c + PAGE_SIZE, filtered.length) : c
          );
        }
      },
      { rootMargin: "400px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length]);

  const mutate = useMutation({
    mutationFn: (vars: { idea: IdeaCard; status: string }) =>
      updateFn({ data: { id: vars.idea.id, status: vars.status } }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["ideas"] });
      const prev = qc.getQueryData(["ideas"]);
      qc.setQueryData(["ideas"], (old: any) => ({
        ideas: old.ideas.map((i: any) =>
          i.id === vars.idea.id ? { ...i, status: vars.status } : i
        ),
      }));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["ideas"], ctx.prev);
      toast.error("Failed to update status");
    },
    onSuccess: (_d, vars) => {
      if (vars.status === "Rejected") {
        toast.success("Idea rejected and removed from pipeline");
      } else {
        toast.success(`Marked as ${vars.status}`);
      }
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
      toast.info("Moving to Approved section and starting AI pipeline...");
      qc.setQueryData(["ideas"], (old: any) => {
        if (!old?.ideas) return old;
        return {
          ideas: old.ideas.map((i: any) =>
            i.id === idea.id ? { ...i, status: "Processing" } : i
          ),
        };
      });

      try {
        await approveFn({ data: { id: idea.id } });
        qc.invalidateQueries({ queryKey: ["ideas"] });
      } catch (err: any) {
        toast.error("Failed to process idea: " + err.message);
        qc.invalidateQueries({ queryKey: ["ideas"] });
      }
      return;
    }

    const status = ACTION_TO_STATUS[action];
    mutate.mutate({ idea, status });
  };

  const visibleItems = filtered.slice(0, visibleCount);
  const tabConfig = TABS.find((t) => t.key === activeTab)!;

  return (
    <div className="min-h-screen w-full bg-background/50">
      <div className="mx-auto w-full max-w-2xl px-3 sm:px-4 pt-4 sm:pt-6 pb-20">
        <div className="sticky top-0 z-30 -mx-3 sm:-mx-4 px-3 sm:px-4 pt-2 pb-3 bg-white/5 backdrop-blur-2xl border-b border-white/10 mb-4 sm:rounded-b-2xl">
          <header className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="size-10 rounded-xl gradient-primary grid place-items-center shadow-glow">
                <GraduationCap className="size-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-base font-black leading-none text-white tracking-tight">
                  SKY Academy
                </h1>
                <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-[0.2em] font-black">
                  AI Content Intelligence
                </p>
              </div>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white px-4 py-2 rounded-full bg-white/5 border border-white/10 inline-flex items-center gap-2 disabled:opacity-50 transition-all"
            >
              {isFetching ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              Refresh
            </button>
          </header>

          <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all shrink-0",
                    active
                      ? "bg-indigo-600 text-white border-transparent shadow-glow"
                      : "bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10"
                  )}
                >
                  <Icon className="size-3.5" />
                  {t.label}
                  <span className={cn("min-w-[18px] text-center px-1.5 rounded-full text-[9px] font-black", active ? "bg-black/20" : "bg-white/10")}>
                    {counts[t.key]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          {isLoading ? (
            <div className="space-y-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="aspect-video w-full rounded-[2.5rem] bg-white/5 animate-pulse border border-white/5" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-[3rem] bg-white/5 border border-white/10 px-6 py-20 text-center backdrop-blur-md relative overflow-hidden group">
              <div className="absolute inset-0 bg-linear-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
              <div className="size-16 mx-auto rounded-[2rem] bg-indigo-500/10 grid place-items-center mb-6 border border-indigo-500/20 shadow-inner relative z-10">
                <Sparkles className="size-8 text-indigo-400" />
              </div>
              <h3 className="text-xl font-black text-white tracking-tight relative z-10">No {activeTab.toLowerCase()} ideas</h3>
              <p className="text-sm text-slate-500 mt-2 max-w-[200px] mx-auto leading-relaxed font-medium relative z-10">
                {activeTab === "Pending" ? "Your inbox is empty. Time to scrape some more!" : `Your ${activeTab.toLowerCase()} list is currently empty.`}
              </p>
            </div>
          ) : (
            <>
              {visibleItems.map((idea) => (
                <IdeaCardView
                  key={idea.id}
                  idea={idea}
                  actions={tabConfig.actions}
                  onAction={handleAction}
                  pending={mutate.isPending}
                />
              ))}
              {visibleCount < filtered.length && (
                <div ref={sentinelRef} className="py-8 grid place-items-center text-slate-500">
                  <Loader2 className="size-6 animate-spin" />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
