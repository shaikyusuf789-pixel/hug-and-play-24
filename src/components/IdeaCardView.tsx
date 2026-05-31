import { memo, useState } from "react";
import { Eye, Calendar, Clock, ExternalLink, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActionKey = "approve" | "reject" | "priority" | "done" | "generate";

export interface IdeaCard {
  id: string;
  video_url: string;
  views: number | null;
  published_date: string | null;
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
      "rounded-[2rem] sm:rounded-3xl bg-card/60 backdrop-blur-xl border border-white/20 dark:border-white/5 shadow-2xl shadow-indigo-500/10 overflow-hidden flex flex-col animate-fade-in relative group transition-all duration-300 hover:shadow-indigo-500/20 hover:-translate-y-1",
      isProcessing && "opacity-70 grayscale-[0.5]"
    )}>

      {isProcessing && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/5 backdrop-blur-[1px]">
          <Loader2 className="size-8 animate-spin text-primary mb-2" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Processing...</span>
          {idea.processing_step && (
            <span className="text-[10px] text-primary/80 mt-1 font-medium italic animate-pulse">
              {idea.processing_step}
            </span>
          )}
        </div>

      )}
      {/* Thumbnail */}
      <div className="relative w-full aspect-video bg-muted overflow-hidden">
        {idea.thumbnail_url ? (
          <img
            src={idea.thumbnail_url}
            alt={idea.original_title || idea.proposed_title || "thumbnail"}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-xs text-muted-foreground">
            No thumbnail
          </div>
        )}
        <div className="absolute inset-0 bg-linear-to-t from-card/90 via-transparent to-transparent pointer-events-none" />
        {idea.duration && (
          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-black/70 text-white">
            {idea.duration}
          </span>
        )}
        {idea.video_url && (
          <a
            href={idea.video_url}
            target="_blank"
            rel="noreferrer"
            className="absolute top-2 right-2 glass rounded-full p-2 text-foreground/90 hover:text-primary transition"
          >
            <ExternalLink className="size-4" />
          </a>
        )}
        <StatusBadge
          status={idea.status}
          className="absolute top-2 left-2"
        />
      </div>

      {/* Body */}
      <div className="px-4 sm:px-5 pt-3 pb-4 space-y-3 sm:space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">
            Original Title
          </div>
          <p className="text-sm text-foreground/90 leading-snug line-clamp-2">
            {idea.original_title ? (
              <>
                "{idea.original_title}" {idea.sources_master?.channel_name && (
                  <span className="text-primary font-medium px-2 py-0.5 rounded-full bg-primary/10 ml-1">
                    {idea.sources_master.channel_name}
                  </span>
                )}
              </>
            ) : "—"}
          </p>
        </div>


        <div>
          <div className="text-[10px] uppercase tracking-widest text-primary font-semibold mb-1">
            Proposed Title
          </div>
          <h2 className="text-sm sm:text-base font-bold leading-snug text-foreground group-hover:text-primary transition-colors">
            {idea.proposed_title || "—"}
          </h2>
        </div>


        {/* Meta */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {idea.views && (
            <span className="inline-flex items-center gap-1">
              <Eye className="size-3.5" />
              <span className="font-medium text-foreground">{idea.views.toLocaleString()}</span>
            </span>
          )}
          {idea.published_date && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-3.5" />
              {new Date(idea.published_date).toLocaleDateString()}
            </span>
          )}
          {idea.duration && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" />
              {idea.duration}
            </span>
          )}
        </div>

        {/* summary points */}
        {summary.length > 0 && (
          <div className="bg-gradient-to-br from-indigo-500/5 to-purple-500/5 rounded-2xl p-3 border border-indigo-500/10">
            <div className="text-[10px] uppercase tracking-widest text-indigo-600 dark:text-indigo-400 font-black mb-2 flex items-center gap-1.5">
              <div className="size-1.5 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
              Summary Points
            </div>

            <div className="relative">
              <ul className="space-y-0.5 transition-all">
                {visible.map((s: string, i: number) => (
                  <li
                    key={i}
                    className="text-[13px] text-foreground/85 leading-[1.35] flex gap-1.5"
                  >
                    <span className="text-primary mt-[5px] shrink-0 text-[10px]">●</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
              {!expanded && hasMore && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-linear-to-t from-card to-transparent" />
              )}
            </div>
            {hasMore && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-primary hover:text-primary/80 transition"
              >
                {expanded ? (
                  <>
                    Show Less <ChevronUp className="size-3" />
                  </>
                ) : (
                  <>
                    Read More <ChevronDown className="size-3" />
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
              "grid gap-2 pt-1",
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
  approve: { label: "Approve", className: "gradient-accept text-white" },
  reject: { label: "Reject", className: "gradient-reject text-white" },
  priority: { label: "Priority", className: "gradient-orange text-white" },
  done: { label: "Done", className: "gradient-primary text-primary-foreground" },
  generate: { label: "Generate", className: "gradient-blue text-white" },
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
        "py-2 sm:py-2.5 rounded-xl font-bold text-[10px] sm:text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all duration-200 disabled:opacity-50 hover:brightness-110 hover:shadow-xl",
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
    Pending: "bg-muted text-muted-foreground",
    Processing: "bg-primary/20 text-primary border border-primary/20",
    Approved: "gradient-accept text-white",
    Rejected: "gradient-reject text-white",
    Priority: "gradient-orange text-white",
    Done: "gradient-primary text-primary-foreground",
  };

  if (status === "Pending") return null;
  return (
    <span
      className={cn(
        "px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm backdrop-blur-md border border-white/20",
        map[status] || map["Pending"],
        className
      )}
    >
      {status}
    </span>

  );
}