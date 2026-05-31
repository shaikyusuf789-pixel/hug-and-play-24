import { createFileRoute, useRouterState, Link, Outlet } from "@tanstack/react-router";
import { 
  LayoutDashboard, 
  ListVideo, 
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
  Menu
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    // Daily channel performance check
    const checkPerformance = async () => {
      try {
        // @ts-ignore - function exists in DB but might not be in types yet
        await supabase.rpc('check_channel_performance');
      } catch (error) {
        console.error("Failed to check channel performance:", error);
      }
    };
    checkPerformance();
  }, []);

  const navGroups: NavGroup[] = [
    {
      label: "PIPELINE",
      items: [
        { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { to: "/idea-cards", label: "Idea Cards", icon: Inbox, badge: "NEW" },
        { to: "/script-generator", label: "Scripting", icon: StickyNote, number: "1" },
        { to: "/chunks", label: "Chunks", icon: Layers, number: "2" },
        { to: "/audio", label: "Audio", icon: Mic2, number: "3" },
        { to: "/slides", label: "Slides", icon: FileVideo, number: "4" },
        { to: "/annotations", label: "Annotations", icon: ListVideo, number: "5" },
        { to: "/master-video", label: "Master Video", icon: FileVideo, number: "6" },
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
    <div className="flex flex-col h-full sidebar-gradient backdrop-blur-3xl bg-black/20">

      <div className="px-6 py-6 flex items-center gap-3 border-b mb-4">
        <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-black shadow-lg shadow-indigo-500/40 border border-white/10 italic tracking-tighter">SKY</div>
        <div>
          <h1 className="text-sm font-bold text-white leading-tight">SKY Studio</h1>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">AI Video Bot v4.2</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-6">
        <div className="px-3 mb-4 space-y-2">
          <Link
            to="/dashboard"
            onClick={() => setIsMobileMenuOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm transition-all duration-200 group relative",
              path === "/dashboard"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" 
                : "text-slate-400 hover:bg-white/5 hover:text-white border border-white/5"

            )}
          >
            <LayoutDashboard className={cn("h-4 w-4", path === "/dashboard" ? "text-white" : "text-slate-400 group-hover:text-slate-600")} />
            <span className="font-semibold text-white">Dashboard</span>
            {path === "/dashboard" && <div className="absolute left-0 w-1 h-6 bg-white rounded-r-full my-auto inset-y-0" />}
          </Link>

          <Link
            to="/tables"
            onClick={() => setIsMobileMenuOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm transition-all duration-200 group relative",
              path === "/tables"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" 
                : "text-slate-400 hover:bg-white/5 hover:text-white border border-white/5"

            )}
          >
            <Database className={cn("h-4 w-4", path === "/tables" ? "text-white" : "text-slate-400 group-hover:text-slate-600")} />
            <span className="font-semibold text-white">Database Tables</span>
            {path === "/tables" && <div className="absolute left-0 w-1 h-6 bg-white rounded-r-full my-auto inset-y-0" />}
          </Link>

          <Button variant="outline" className="w-full justify-between text-rose-500 border-rose-100 bg-rose-50/50 hover:bg-rose-50 hover:text-rose-600 group">
            <div className="flex items-center gap-2">
              <Trash2 className="h-4 w-4" />
              <div className="text-left">
                <div className="text-[10px] font-bold uppercase">A. Delete All</div>
                <div className="text-[9px] text-slate-400 group-hover:text-rose-400 font-normal">Audio · Slides · Clips</div>
              </div>
            </div>
            <span className="text-[10px] bg-rose-100 px-1 rounded font-bold">DEL</span>
          </Button>
        </div>

        {navGroups.map((group) => (
          <div key={group.label} className="space-y-1">
            <h3 className="px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{group.label}</h3>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = path === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center justify-between rounded-xl px-4 py-2.5 text-sm transition-all duration-200 group relative",
                    active 
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" 
                      : "text-slate-400 hover:bg-white/5 hover:text-white"

                  )}
                >
                  <div className="flex items-center gap-3">
                    {item.number && (
                      <span className={cn(
                        "text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full border",
                        active ? "border-white/30" : "border-white/10 text-slate-400"
                      )}>
                        {item.number}
                      </span>
                    )}
                    {!item.number && <Icon className={cn("h-4 w-4", active ? "text-white" : "text-slate-400 group-hover:text-slate-600")} />}
                    <span className="font-medium">{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="text-[9px] font-bold bg-rose-50 text-rose-500 px-1.5 py-0.5 rounded uppercase">
                      {item.badge}
                    </span>
                  )}
                  {active && <div className="absolute left-0 w-1 h-6 bg-white rounded-r-full my-auto inset-y-0" />}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div className="p-4 mt-auto">
        <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">TELUGU · POE · DNA</span>
            <span className="text-[9px] font-bold text-slate-400">V4.2</span>
          </div>
          <div className="w-full bg-black/20 rounded-full h-1">
            <div className="bg-indigo-500 h-1 rounded-full w-2/3"></div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground selection:bg-primary/30">
      <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-sidebar/80 md:flex md:flex-col shadow-2xl backdrop-blur-3xl">
        <SidebarContent />
      </aside>

      <main className="flex-1 overflow-x-hidden overflow-y-auto">
        <header className="h-16 border-b border-white/10 bg-background/60 backdrop-blur-2xl sticky top-0 z-40 px-4 md:px-6 flex items-center justify-between shadow-sm shadow-white/[0.02]">
          <div className="flex items-center gap-3 flex-1 max-w-xl">
             <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
               <SheetTrigger asChild>
                 <Button variant="ghost" size="icon" className="md:hidden shrink-0">
                   <Menu className="h-5 w-5 text-slate-400" />
                 </Button>
               </SheetTrigger>
               <SheetContent side="left" className="p-0 w-64">
                 <SidebarContent />
               </SheetContent>
             </Sheet>

             <div className="relative w-full group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                <Input 
                  placeholder="Search project..." 
                  className="pl-10 h-10 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-indigo-500 rounded-xl w-full text-sm"

                />
             </div>
          </div>
          
          <div className="flex items-center gap-2 md:gap-3 ml-2">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 rounded-full border border-emerald-500/20">
               <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
               <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Live</span>
            </div>
            
            <div className="hidden sm:block h-8 w-px bg-white/5 mx-1" />
            
            <NotificationDrawer />
            
            <Button variant="ghost" size="icon" className="hover:bg-white/5 rounded-full h-9 w-9 shrink-0">
              <Settings className="h-5 w-5 text-slate-400" />
            </Button>
          </div>
        </header>

        <div className="max-w-[1600px] mx-auto min-h-[calc(100vh-64px)] p-4 md:p-6">
          <Outlet />
        </div>
      </main>
      
      <AIChatAssistant />
    </div>
  );
}
