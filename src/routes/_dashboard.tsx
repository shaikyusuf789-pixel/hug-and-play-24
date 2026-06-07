import { createFileRoute, useRouterState, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { 
  LayoutDashboard, 
  Settings, 
  History, 
  Database, 
  Youtube, 
  FileVideo,
  Mic2,
  Layers,
  StickyNote,
  Trash2,
  Inbox,
  Search,
  Menu,
  Sparkles,
  Wand2,
  Rocket,
  LogOut
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AIChatAssistant } from "@/components/AIChatAssistant";
import { NotificationDrawer } from "@/components/NotificationDrawer";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export const Route = createFileRoute("/_dashboard")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && localStorage.getItem("sky_auth") !== "1") {
      throw redirect({ to: "/login" });
    }
  },
  component: DashboardLayout,
});

interface NavItem {
  to: string;
  label: string;
  icon: any;
  number?: string;
  badge?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

function DashboardLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem("sky_auth");
    navigate({ to: "/login" });
  };

  const navGroups: NavGroup[] = [
    {
      label: "PIPELINE",
      items: [
        { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { to: "/ideas-engine", label: "Ideas Engine", icon: Sparkles },
        { to: "/idea-cards", label: "Idea Cards", icon: Inbox },
        { to: "/script-generator", label: "Scripting", icon: StickyNote, number: "1" },
        { to: "/chunks", label: "Chunks", icon: Layers, number: "2" },
        { to: "/audio", label: "Audio", icon: Mic2, number: "3" },
        { to: "/slides", label: "Slides", icon: FileVideo, number: "4" },
        { to: "/annotations", label: "Annotations", icon: Wand2, number: "5" },
        { to: "/mega", label: "Mega", icon: Rocket, badge: "AUTO" },
        { to: "/video-editor", label: "Video Editor", icon: Wand2, number: "6" },
        { to: "/youtube", label: "YouTube", icon: Youtube, number: "7" },
      ]
    },
    {
      label: "UTILITIES",
      items: [
        { to: "/history", label: "History", icon: History },
        { to: "/storage", label: "Storage", icon: Database, badge: "24H" },
        { to: "/settings", label: "Settings", icon: Settings },
      ]
    }
  ];

  const SidebarContent = () => (
    <div className="flex h-full flex-col bg-white border-r border-slate-200">
      <div className="flex items-center gap-3 px-6 py-8">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/20 text-white font-black">SKY</div>
        <div>
          <h1 className="text-sm font-black tracking-tight text-slate-900">SKY Studio</h1>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">AI Video Bot v4.2</p>
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-4">
        {navGroups.map((group) => (
          <div key={group.label} className="space-y-2">
            <h3 className="px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">{group.label}</h3>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = path === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-bold transition-all",
                    active 
                      ? "bg-primary/10 text-primary" 
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <div className="flex items-center gap-3">
                    {item.number ? (
                      <span className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-bold border",
                        active ? "bg-primary border-primary text-white" : "border-slate-200 text-slate-400"
                      )}>
                        {item.number}
                      </span>
                    ) : (
                      <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-slate-400")} />
                    )}
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-accent">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div className="p-4">
        <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Storage Usage</span>
            <span className="text-[10px] font-bold text-slate-900">65%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-200">
            <div className="h-1.5 w-2/3 rounded-full bg-primary"></div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50 selection:bg-primary/10">
      <aside className="hidden w-64 shrink-0 lg:flex lg:flex-col">
        <SidebarContent />
      </aside>

      <main className="flex-1 min-w-0">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-4 md:px-6 backdrop-blur-md">
          <div className="flex items-center gap-2 md:gap-4 flex-1">
             <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
               <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden">
                    <Menu className="h-5 w-5" />
                 </Button>
               </SheetTrigger>
                <SheetContent side="left" className="w-64 p-0">
                 <SidebarContent />
               </SheetContent>
             </Sheet>

             <div className="relative w-full max-w-[200px] md:max-w-md">
                 <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input 
                  placeholder="Search..." 
                  className="h-10 w-full rounded-xl border-slate-200 bg-slate-50 pl-10 text-xs md:text-sm focus:bg-white transition-all"
                />
             </div>
          </div>
          
          <div className="flex items-center gap-1.5 md:gap-3">
            <NotificationDrawer />
            <Button variant="ghost" size="icon" className="h-9 w-9 md:h-10 md:w-10 rounded-xl text-slate-400 hover:text-slate-900 hidden xs:flex">
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </header>

        <div className="min-h-[calc(100vh-64px)] overflow-x-hidden p-0">
          <Outlet />
        </div>
      </main>
      
      <AIChatAssistant />
    </div>
  );
}
