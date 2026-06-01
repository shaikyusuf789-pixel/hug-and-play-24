import { memo, useState } from "react";
import { Eye, Calendar, Clock, ExternalLink, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActionKey = "approve" | "reject" | "priority" | "done" | "generate";

function formatPublishedDate(iso?: string | null, fallback?: string | null): string | null {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  if (iso) {
    const d = new Date(iso);
    if (!isNaN(d.getTime())) return fmt(d);
  }
  if (fallback) {
    const m = fallback.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      let [, dd, mm, yy] = m;
      let year = parseInt(yy);
      if (year < 100) year += 2000;
      const d = new Date(Date.UTC(year, parseInt(mm) - 1, parseInt(dd)));
      if (!isNaN(d.getTime())) return fmt(d);
    }
    const d = new Date(fallback);
    if (!isNaN(d.getTime())) return fmt(d);
  }
  return null;
}


export interface IdeaCard {
  id: string;
  video_url: string;
  views: number | null;
  published_date: string | null;
  published_at?: string | null;

  duration: string | null;
  thumbnail_url: string | null;
  original_title: string | null;
  proposed_title: string | null;
  target_audience: string | null;
  core_hooks: string[] | string | null;
  summary_points: string[] | string | null;
  video_outline: any;
  original_summary: string | null;
  status: string;
  processing_step?: string | null;
  sources_master?: {
    channel_name: string;
  };
}

interface Props {
  idea: IdeaCard;
  actions: ActionKey[];
  onAction: (key: ActionKey, idea: IdeaCard) => void;
  pending?: boolean;
}

function IdeaCardViewBase({ idea, actions, onAction, pending }: Props) {
  const [expanded, setExpanded] = useState(false);
  const COLLAPSED_COUNT = 5;
  const summary = Array.isArray(idea.summary_points) 
    ? idea.summary_points 
    : typeof idea.summary_points === 'string' 
      ? JSON.parse(idea.summary_points) 
      : [];
      
  const hasMore = summary.length > COLLAPSED_COUNT;
  const visible = (expanded || idea.status === 'Approved' || idea.status === 'Priority') ? summary : summary.slice(0, COLLAPSED_COUNT);

  const isProcessing = idea.status === "Processing";

  return (
    <article className={cn(
      "rounded-[2rem] md:rounded-[2.5rem] bg-white border border-slate-200 shadow-xl shadow-slate-900/5 overflow-hidden flex flex-col animate-fade-in relative group transition-all duration-500 hover:shadow-2xl hover:-translate-y-1 hover:border-indigo-300",
      isProcessing && "opacity-70 grayscale-[0.5]"
    )}>

      {isProcessing && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px]">
          <Loader2 className="size-8 md:size-10 animate-spin text-indigo-400 mb-4 shadow-white-lg" />
          <span className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-white bg-indigo-600 px-3 md:px-4 py-1.5 rounded-full shadow-white-lg">
            AI Engine Running
          </span>
        </div>
      )}
      {/* Thumbnail */}
      <div className="relative w-full aspect-video bg-black/40 overflow-hidden">
        {idea.thumbnail_url ? (
          <img
            src={idea.thumbnail_url}
            alt={idea.original_title || idea.proposed_title || "thumbnail"}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-[10px] font-black uppercase tracking-widest text-slate-700">
            No Preview
          </div>
        )}
        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
        {idea.duration && (
          <span className="absolute bottom-2 md:bottom-3 right-2 md:right-3 px-1.5 md:px-2 py-0.5 rounded-md text-[9px] md:text-[10px] font-black bg-black/80 text-white border border-white/10">
            {idea.duration}
          </span>
        )}
        {idea.video_url && (
          <a
            href={idea.video_url}
            target="_blank"
            rel="noreferrer"
            className="absolute top-2 md:top-3 right-2 md:right-3 h-8 w-8 md:h-9 md:w-9 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-indigo-600 hover:scale-110 transition-all border border-white/10"
          >
            <ExternalLink className="size-3.5 md:size-4" />
          </a>
        )}
        <StatusBadge
          status={idea.status}
          className="absolute top-2 md:top-3 left-2 md:left-3"
        />
      </div>

      {/* Body */}
      <div className="px-5 md:px-6 py-5 md:py-6 space-y-4 md:space-y-5">
        <div className="space-y-1">
          <div className="text-[8px] md:text-[9px] uppercase tracking-[0.15em] md:tracking-[0.2em] text-slate-500 font-black flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-slate-700" />
            Original Intelligence
          </div>
          <p className="text-xs md:text-sm font-semibold text-slate-900 leading-snug line-clamp-2 italic">
            {idea.original_title ? (
              <>
                "{idea.original_title}" {idea.sources_master?.channel_name && (
                  <span className="text-indigo-700 font-black px-1.5 md:px-2 py-0.5 rounded-lg bg-indigo-50 ml-1 border border-indigo-200 uppercase text-[8px] md:text-[9px] tracking-widest">
                    {idea.sources_master.channel_name}
                  </span>
                )}
              </>
            ) : "—"}
          </p>
        </div>

        <div className="space-y-1">
          <div className="text-[8px] md:text-[9px] uppercase tracking-[0.15em] md:tracking-[0.2em] text-indigo-600 font-black flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
            Proposed Direction
          </div>
          <h2 className="text-sm sm:text-base md:text-lg font-black leading-tight text-slate-900 group-hover:text-indigo-700 transition-colors tracking-tight">
            {idea.proposed_title ? (
              <>
                {idea.proposed_title}
                {idea.sources_master?.channel_name && (
                  <span className="text-indigo-600"> - {idea.sources_master.channel_name}</span>
                )}
              </>
            ) : "—"}
          </h2>
          {(() => {
            const formatted = formatPublishedDate(idea.published_at, idea.published_date);
            if (!formatted) return null;
            return (
              <div className="text-[10px] md:text-[11px] font-bold text-slate-500 mt-1 flex items-center gap-1">
                <Calendar className="size-3" />
                {formatted}
              </div>
            );
          })()}

        </div>

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-3 md:gap-4 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-600">
          {idea.views && (
            <span className="inline-flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
              <Eye className="size-2.5 md:size-3" />
              <span className="text-slate-800">{idea.views.toLocaleString()}</span>
            </span>
          )}
          {idea.duration && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-2.5 md:size-3" />
              {idea.duration}
            </span>
          )}
        </div>

        {/* summary points */}
        {summary.length > 0 && (
          <div className="bg-indigo-50/60 rounded-2xl md:rounded-3xl p-4 md:p-5 border border-indigo-100 relative overflow-hidden group/summary">
            <div className="absolute inset-0 bg-linear-to-br from-indigo-100/40 to-transparent opacity-0 group-hover/summary:opacity-100 transition-opacity" />
            <div className="text-[8px] md:text-[9px] uppercase tracking-[0.2em] md:tracking-[0.25em] text-indigo-600 font-black mb-3 md:mb-4 flex items-center gap-2 relative z-10">
              <div className="size-1 md:size-1.5 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.6)] animate-pulse" />
              Strategy Intelligence
            </div>

            <div className="relative min-h-[40px] md:min-h-[50px] z-10">
              <ul className="space-y-2 md:space-y-3 transition-all">
                {visible.length > 0 ? (
                  visible.map((s: string, i: number) => (
                    <li
                      key={i}
                      className="text-[12px] md:text-[13px] text-slate-700 leading-relaxed flex gap-2 md:gap-3 group/item"
                    >
                      <span className="text-indigo-600 mt-[5px] md:mt-[6px] shrink-0 text-[9px] md:text-[10px] font-black group-hover/item:scale-110 transition-transform">0{i+1}</span>
                      <span className="group-hover/item:text-slate-900 transition-colors font-medium">{s}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-[10px] md:text-xs text-slate-600 italic py-2 font-medium uppercase tracking-widest text-center">
                    Awaiting AI content generation
                  </li>
                )}
              </ul>
              {!expanded && hasMore && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 md:h-10 bg-linear-to-t from-black/20 to-transparent" />
              )}
            </div>
            {hasMore && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="mt-3 md:mt-4 inline-flex items-center gap-1.5 md:gap-2 text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] md:tracking-[0.2em] text-indigo-600 hover:text-indigo-800 transition-all relative z-10"
              >
                {expanded ? (
                  <>
                    Collapse <ChevronUp className="size-2.5 md:size-3" />
                  </>
                ) : (
                  <>
                    Reveal Strategy <ChevronDown className="size-2.5 md:size-3" />
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Actions */}
        {actions.length > 0 && (
          <div
            className={cn(
              "grid gap-2 md:gap-3 pt-1 md:pt-2",
              actions.length === 1 && "grid-cols-1",
              actions.length === 2 && "grid-cols-2",
              actions.length === 3 && "grid-cols-3"
            )}
          >
            {actions.map((a) => (
              <ActionButton
                key={a}
                action={a}
                disabled={pending}
                onClick={() => onAction(a, idea)}
              />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

export const IdeaCardView = memo(IdeaCardViewBase);

const ACTION_META: Record<
  ActionKey,
  { label: string; className: string }
> = {
  approve: { label: "Approve", className: "bg-emerald-600 hover:bg-emerald-500 text-white" },
  reject: { label: "Reject", className: "bg-slate-100 border border-slate-200 hover:bg-rose-600 hover:border-transparent text-slate-700 hover:text-white" },
  priority: { label: "Priority", className: "bg-amber-600 hover:bg-amber-500 text-white" },
  done: { label: "Done", className: "bg-indigo-600 hover:bg-indigo-500 text-white" },
  generate: { label: "Generate", className: "bg-indigo-600 hover:bg-indigo-500 text-white shadow-button" },
};

function ActionButton({
  action,
  onClick,
  disabled,
}: {
  action: ActionKey;
  onClick: () => void;
  disabled?: boolean;
}) {
  const meta = ACTION_META[action];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] active:scale-95 transition-all duration-300 disabled:opacity-50 hover:shadow-white-lg",
        meta.className
      )}
    >
      {meta.label}
    </button>
  );
}

function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const map: Record<string, string> = {
    Pending: "bg-white/5 text-slate-500 border-white/5",
    Processing: "bg-indigo-600 text-white border-transparent animate-pulse shadow-glow",
    Approved: "bg-emerald-600 text-white border-transparent",
    Rejected: "bg-rose-600 text-white border-transparent",
    Priority: "bg-amber-600 text-white border-transparent",
    Done: "bg-indigo-600 text-white border-transparent",
  };

  if (status === "Pending") return null;
  return (
    <span
      className={cn(
        "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em] shadow-2xl backdrop-blur-md border",
        map[status] || map["Pending"],
        className
      )}
    >
      {status}
    </span>
  );
}
