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
      // NOTE: check_channel_performance RPC is not implemented in the current DB schema.
      // commenting out to avoid 404 errors in logs.
      /*
      try {
        await supabase.rpc('check_channel_performance');
      } catch (error) {
        console.error("Failed to check channel performance:", error);
      }
      */
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
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">

      <div className="mb-3 flex items-center gap-3 border-b border-sidebar-border px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-black text-sidebar-primary-foreground shadow-sm">SKY</div>
        <div>
          <h1 className="text-sm font-bold leading-tight text-foreground">SKY Studio</h1>
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">AI Video Bot v4.2</p>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        <div className="mb-4 space-y-2 px-2">
          <Link
            to="/dashboard"
            onClick={() => setIsMobileMenuOpen(false)}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              path === "/dashboard"
                ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm" 
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"

            )}
          >
            <LayoutDashboard className="h-4 w-4" />
            <span>Dashboard</span>
          </Link>

          <Link
            to="/tables"
            onClick={() => setIsMobileMenuOpen(false)}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              path === "/tables"
                ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm" 
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"

            )}
          >
            <Database className="h-4 w-4" />
            <span>Database Tables</span>
          </Link>

          <Button variant="outline" className="group w-full justify-between border-destructive/20 bg-destructive/5 text-destructive hover:bg-destructive/10 hover:text-destructive">
            <div className="flex items-center gap-2">
              <Trash2 className="h-4 w-4" />
              <div className="text-left">
                <div className="text-[10px] font-bold uppercase">A. Delete All</div>
                <div className="text-[9px] font-normal text-muted-foreground">Audio · Slides · Clips</div>
              </div>
            </div>
            <span className="rounded bg-destructive/10 px-1 text-[10px] font-bold">DEL</span>
          </Button>
        </div>

        {navGroups.map((group) => (
          <div key={group.label} className="space-y-1">
            <h3 className="mb-2 px-3 text-[10px] font-bold uppercase text-muted-foreground">{group.label}</h3>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = path === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={cn(
                    "group relative flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active 
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm" 
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"

                  )}
                >
                  <div className="flex items-center gap-3">
                    {item.number && (
                      <span className={cn(
                        "text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full border",
                        active ? "border-primary-foreground/40" : "border-border text-muted-foreground"
                      )}>
                        {item.number}
                      </span>
                    )}
                    {!item.number && <Icon className="h-4 w-4" />}
                    <span className="font-medium">{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-accent">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div className="p-4 mt-auto">
        <div className="rounded-lg border border-sidebar-border bg-secondary p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase text-primary">TELUGU · POE · DNA</span>
            <span className="text-[9px] font-bold text-muted-foreground">V4.2</span>
          </div>
          <div className="h-1 w-full rounded-full bg-border">
            <div className="h-1 w-2/3 rounded-full bg-primary"></div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground selection:bg-primary/20">
      <aside className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar md:flex md:flex-col">
        <SidebarContent />
      </aside>

      <main className="flex-1 overflow-x-hidden overflow-y-auto">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 shadow-sm backdrop-blur md:px-6">
          <div className="flex items-center gap-3 flex-1 max-w-xl">
             <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
               <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="shrink-0 md:hidden">
                    <Menu className="h-5 w-5" />
                 </Button>
               </SheetTrigger>
                <SheetContent side="left" className="w-64 p-0">
                 <SidebarContent />
               </SheetContent>
             </Sheet>

             <div className="relative w-full group">
                 <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
                <Input 
                  placeholder="Search project..." 
                   className="h-10 w-full rounded-lg bg-card pl-10 text-sm"

                />
             </div>
          </div>
          
          <div className="flex items-center gap-2 md:gap-3 ml-2">
            <div className="hidden items-center gap-1.5 rounded-full border border-accent/20 bg-accent/10 px-3 py-1.5 sm:flex">
               <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
               <span className="text-[10px] font-bold uppercase text-accent">Live</span>
            </div>
            
            <div className="mx-1 hidden h-8 w-px bg-border sm:block" />
            
            <NotificationDrawer />
            
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full">
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </header>

        <div className="mx-auto min-h-[calc(100vh-64px)] max-w-[1600px] p-4 md:p-6">
          <Outlet />
        </div>
      </main>
      
      <AIChatAssistant />
    </div>
  );
}
