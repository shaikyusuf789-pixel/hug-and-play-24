import { useState, useEffect } from "react";
import { 
  Bell, 
  X, 
  AlertCircle, 
  Info, 
  CheckCircle2, 
  Trash2, 
  ExternalLink,
  MoreVertical,
  Check
} from "lucide-react";
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetTrigger 
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean | null;
  created_at: string;
}

export function NotificationDrawer() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    fetchNotifications();

    // Subscribe to new notifications
    const channel = supabase
      .channel("public:notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          setNotifications((prev) => [payload.new as Notification, ...prev]);
          setUnreadCount((prev) => prev + 1);
          toast.info("New notification: " + payload.new.title);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchNotifications = async () => {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching notifications:", error);
      return;
    }

    setNotifications((data || []) as Notification[]);
    setUnreadCount(data?.filter((n) => !n.read).length || 0);
  };

  const markAsRead = async (id: string) => {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", id);

    if (error) {
      toast.error("Failed to mark as read");
      return;
    }

    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const markAllAsRead = async () => {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("read", false);

    if (error) {
      toast.error("Failed to mark all as read");
      return;
    }

    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    toast.success("All notifications marked as read");
  };

  const deleteNotification = async (id: string) => {
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Failed to delete notification");
      return;
    }

    setNotifications((prev) => prev.filter((n) => n.id !== id));
    toast.success("Notification deleted");
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "warning":
        return <AlertCircle className="h-5 w-5 text-amber-500" />;
      case "suggestion":
        return <CheckCircle2 className="h-5 w-5 text-indigo-500" />;
      case "error":
        return <AlertCircle className="h-5 w-5 text-rose-500" />;
      default:
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative hover:bg-slate-100 rounded-full">
          <Bell className="h-5 w-5 text-slate-600" />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white border-2 border-white">
              {unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:w-[400px] p-0 border-l-slate-100 shadow-2xl">
        <div className="flex flex-col h-full bg-slate-50/30">
          <SheetHeader className="p-6 border-b bg-white">
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle className="text-xl font-bold text-slate-900">Notifications</SheetTitle>
                <p className="text-xs text-slate-500 mt-1">Stay updated with your pipeline activity</p>
              </div>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" onClick={markAllAsRead} className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 font-semibold text-xs">
                  Mark all as read
                </Button>
              )}
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                  <div className="h-16 w-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                    <Bell className="h-8 w-8 text-slate-300" />
                  </div>
                  <h3 className="text-slate-900 font-bold">No notifications yet</h3>
                  <p className="text-sm text-slate-500 mt-2 max-w-[240px]">We'll alert you when there are channel suggestions or pipeline updates.</p>
                </div>
              ) : (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={cn(
                      "group relative flex gap-4 p-4 rounded-2xl border transition-all duration-200",
                      notification.read 
                        ? "bg-white/50 border-slate-100 opacity-80" 
                        : "bg-white border-indigo-100 shadow-sm shadow-indigo-50"
                    )}
                  >
                    <div className="shrink-0 mt-0.5">
                      {getIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0 pr-6">
                      <div className="flex items-center gap-2 mb-1">
                        <p className={cn(
                          "text-sm font-bold truncate",
                          notification.read ? "text-slate-600" : "text-slate-900"
                        )}>
                          {notification.title}
                        </p>
                        {!notification.read && <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />}
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed mb-2">
                        {notification.message}
                      </p>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    
                    <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                       {!notification.read && (
                         <Button
                           variant="ghost"
                           size="icon"
                           className="h-7 w-7 rounded-lg hover:bg-indigo-50 text-indigo-600"
                           onClick={() => markAsRead(notification.id)}
                         >
                           <Check className="h-3.5 w-3.5" />
                         </Button>
                       )}
                       <Button
                         variant="ghost"
                         size="icon"
                         className="h-7 w-7 rounded-lg hover:bg-rose-50 text-rose-600"
                         onClick={() => deleteNotification(notification.id)}
                       >
                         <Trash2 className="h-3.5 w-3.5" />
                       </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
