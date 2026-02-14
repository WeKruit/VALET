import { useState, useRef, useEffect } from "react";
import { Bell, Check, CheckCheck } from "lucide-react";
import { Button } from "@valet/ui/components/button";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

export function NotificationPanel() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data } = api.notifications.list.useQuery({
    queryKey: ["notifications", "list"],
    queryData: { query: { page: 1, pageSize: 20 } },
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60,
  });

  const markRead = api.notifications.markRead.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllRead = api.notifications.markAllRead.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const notifications = data?.status === 200 ? data.body.data : [];
  const unreadCount = data?.status === 200 ? data.body.unreadCount : 0;

  // Close on outside click or Escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [open]);

  function handleNotificationClick(id: string, isRead: boolean) {
    if (!isRead) {
      markRead.mutate({ params: { id }, body: {} });
    }
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Notifications"
        aria-expanded={open}
        className={cn(
          "flex items-center justify-center h-9 w-9 rounded-[var(--wk-radius-lg)] cursor-pointer",
          "text-[var(--wk-text-secondary)] hover:bg-[var(--wk-surface-raised)] hover:text-[var(--wk-text-primary)] transition-colors duration-150",
          open && "bg-[var(--wk-surface-raised)] text-[var(--wk-text-primary)]"
        )}
      >
        <div className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--wk-status-error)] px-1 text-[10px] font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>
      </button>

      {open && (
        <div
          className={cn(
            "absolute right-0 top-full mt-1 w-[calc(100vw-2rem)] sm:w-96 max-w-96",
            "bg-[var(--wk-surface-white)] text-[var(--wk-text-primary)]",
            "rounded-[var(--wk-radius-lg)]",
            "border border-[var(--wk-border-default)]",
            "shadow-[var(--wk-shadow-lg)]",
            "z-50",
            "animate-in fade-in-0 zoom-in-95 duration-100"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--wk-border-subtle)]">
            <h3 className="text-sm font-semibold">Notifications</h3>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAllRead.mutate({ body: {} })}
                disabled={markAllRead.isPending}
                className="text-xs"
              >
                <CheckCheck className="mr-1 h-3.5 w-3.5" />
                Mark all read
              </Button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                <Bell className="h-8 w-8 text-[var(--wk-text-tertiary)] mb-2" />
                <p className="text-sm text-[var(--wk-text-secondary)]">
                  No notifications yet
                </p>
                <p className="text-xs text-[var(--wk-text-tertiary)] mt-1">
                  You'll be notified when tasks complete or need attention.
                </p>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n.id, n.read)}
                  className={cn(
                    "w-full text-left px-4 py-3 border-b border-[var(--wk-border-subtle)] last:border-b-0",
                    "hover:bg-[var(--wk-surface-raised)] transition-colors duration-100 cursor-pointer",
                    !n.read && "bg-blue-50/50"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={cn(
                          "text-sm truncate",
                          !n.read ? "font-semibold" : "font-medium text-[var(--wk-text-secondary)]"
                        )}>
                          {n.title}
                        </p>
                        {!n.read && (
                          <span className="flex-shrink-0 h-2 w-2 rounded-full bg-[var(--wk-copilot)]" />
                        )}
                      </div>
                      <p className="text-xs text-[var(--wk-text-secondary)] mt-0.5 line-clamp-2">
                        {n.body}
                      </p>
                      <p className="text-[10px] text-[var(--wk-text-tertiary)] mt-1">
                        {formatRelativeTime(n.createdAt)}
                      </p>
                    </div>
                    {!n.read && (
                      <Check className="h-4 w-4 flex-shrink-0 text-[var(--wk-text-tertiary)] mt-0.5" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
