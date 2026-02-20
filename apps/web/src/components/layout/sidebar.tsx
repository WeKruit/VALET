import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  ListTodo,
  ClipboardList,
  Send,
  Settings,
  Moon,
  Sun,
  PanelLeftClose,
  PanelLeft,
  User,
  Server,
  Globe,
  Rocket,
  Activity,
  Cpu,
} from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@valet/ui/components/avatar";
import { useUIStore } from "@/stores/ui.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { UpgradeCta } from "@/features/billing/components/upgrade-cta";
import { cn } from "@/lib/utils";

const navItems = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/tasks", label: "Applications", icon: ListTodo },
  { path: "/apply", label: "Apply", icon: Send },
  { path: "/settings", label: "Settings", icon: Settings },
];

const adminNavItems = [
  { path: "/admin/tasks", label: "Tasks", icon: ClipboardList },
  { path: "/admin/sandboxes", label: "Sandboxes", icon: Server },
  { path: "/admin/deploys", label: "Deploys", icon: Rocket },
  { path: "/admin/monitoring", label: "Monitoring", icon: Activity },
  { path: "/admin/sessions", label: "Sessions", icon: Globe },
  { path: "/admin/workers", label: "Workers", icon: Cpu },
];

interface SidebarContentProps {
  collapsed?: boolean;
  onNavigate?: () => void;
}

export function SidebarContent({ collapsed = false, onNavigate }: SidebarContentProps) {
  const { theme, setTheme, sidebarOpen, toggleSidebar } = useUIStore();
  const { user } = useAuth();
  const expanded = collapsed ? false : sidebarOpen;
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  return (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--wk-border-subtle)]">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--wk-radius-lg)] bg-[var(--wk-text-primary)]">
          <span className="text-sm font-bold text-[var(--wk-surface-page)]">V</span>
        </div>
        {expanded && (
          <span className="font-display text-lg font-semibold tracking-tight">Valet</span>
        )}
      </div>

      {/* User info */}
      {user && (
        <div
          className={cn(
            "flex items-center border-b border-[var(--wk-border-subtle)]",
            expanded ? "gap-3 px-4 py-3" : "justify-center py-3",
          )}
        >
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarImage src={user.avatarUrl ?? undefined} alt={user.name} />
            <AvatarFallback>
              <User className="h-3.5 w-3.5" />
            </AvatarFallback>
          </Avatar>
          {expanded && (
            <span className="text-sm font-medium text-[var(--wk-text-primary)] truncate">
              {user.name}
            </span>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            title={!expanded ? item.label : undefined}
            aria-label={item.label}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "group relative flex items-center gap-3 px-3 py-2.5 rounded-[var(--wk-radius-lg)] text-sm font-medium",
                "transition-all duration-200 ease-[var(--wk-ease-default)]",
                isActive
                  ? "bg-[var(--wk-surface-raised)] text-[var(--wk-text-primary)]"
                  : "text-[var(--wk-text-secondary)] hover:bg-[var(--wk-surface-raised)] hover:text-[var(--wk-text-primary)]",
                !expanded && "justify-center",
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* Active accent bar */}
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[var(--wk-accent-amber)] transition-all duration-200" />
                )}
                <item.icon className="h-5 w-5 shrink-0" />
                {expanded && (
                  <span className="transition-transform duration-200 ease-[var(--wk-ease-default)] group-hover:translate-x-0.5">
                    {item.label}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}

        {/* Admin section — only visible to admin/superadmin */}
        {isAdmin && (
          <>
            {expanded && (
              <div className="pt-4 pb-1">
                <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--wk-text-tertiary)]">
                  Admin
                </p>
              </div>
            )}
            {!expanded && <div className="my-2 mx-3 h-px bg-[var(--wk-border-subtle)]" />}
            {adminNavItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                title={!expanded ? item.label : undefined}
                aria-label={item.label}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    "group relative flex items-center gap-3 px-3 py-2.5 rounded-[var(--wk-radius-lg)] text-sm font-medium",
                    "transition-all duration-200 ease-[var(--wk-ease-default)]",
                    isActive
                      ? "bg-[var(--wk-surface-raised)] text-[var(--wk-text-primary)]"
                      : "text-[var(--wk-text-secondary)] hover:bg-[var(--wk-surface-raised)] hover:text-[var(--wk-text-primary)]",
                    !expanded && "justify-center",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[var(--wk-accent-amber)] transition-all duration-200" />
                    )}
                    <item.icon className="h-5 w-5 shrink-0" />
                    {expanded && (
                      <span className="transition-transform duration-200 ease-[var(--wk-ease-default)] group-hover:translate-x-0.5">
                        {item.label}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* Upgrade CTA for free-tier users */}
      {user && (!user.subscriptionTier || user.subscriptionTier === "free") && (
        <div className="px-2 pb-2">
          <UpgradeCta collapsed={!expanded} />
        </div>
      )}

      {/* Bottom controls */}
      <div className="px-2 py-4 border-t border-[var(--wk-border-subtle)] space-y-1">
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title={theme === "dark" ? "Light mode" : "Dark mode"}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className={cn(
            "flex items-center gap-3 w-full px-3 py-2.5 rounded-[var(--wk-radius-lg)] text-sm font-medium cursor-pointer",
            "text-[var(--wk-text-secondary)] hover:bg-[var(--wk-surface-raised)] hover:text-[var(--wk-text-primary)]",
            "transition-all duration-200 ease-[var(--wk-ease-default)]",
            !expanded && "justify-center",
          )}
        >
          {theme === "dark" ? (
            <Sun className="h-5 w-5 shrink-0" />
          ) : (
            <Moon className="h-5 w-5 shrink-0" />
          )}
          {expanded && <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>}
        </button>

        {/* Only show collapse toggle on desktop */}
        {!collapsed && (
          <button
            onClick={toggleSidebar}
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            className={cn(
              "flex items-center gap-3 w-full px-3 py-2.5 rounded-[var(--wk-radius-lg)] text-sm font-medium cursor-pointer",
              "text-[var(--wk-text-secondary)] hover:bg-[var(--wk-surface-raised)] hover:text-[var(--wk-text-primary)]",
              "transition-all duration-200 ease-[var(--wk-ease-default)]",
              !expanded && "justify-center",
            )}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-5 w-5 shrink-0" />
            ) : (
              <PanelLeft className="h-5 w-5 shrink-0" />
            )}
            {expanded && <span>Collapse</span>}
          </button>
        )}
      </div>
    </>
  );
}

export function Sidebar() {
  const { sidebarOpen } = useUIStore();

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col h-screen border-r border-[var(--wk-border-subtle)]",
        "bg-[var(--wk-surface-page)]",
        "transition-all duration-[var(--wk-duration-base)] ease-[var(--wk-ease-default)]",
        sidebarOpen ? "w-60" : "w-16",
      )}
    >
      <SidebarContent />
    </aside>
  );
}
