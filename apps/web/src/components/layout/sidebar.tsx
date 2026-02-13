import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  ListTodo,
  Send,
  Settings,
  Moon,
  Sun,
  PanelLeftClose,
  PanelLeft,
  User,
} from "lucide-react";
import { useUIStore } from "@/stores/ui.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { cn } from "@/lib/utils";

const navItems = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/tasks", label: "Applications", icon: ListTodo },
  { path: "/apply", label: "Apply", icon: Send },
  { path: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const { sidebarOpen, toggleSidebar, theme, setTheme } = useUIStore();
  const { user } = useAuth();

  return (
    <aside
      className={cn(
        "flex flex-col h-screen border-r border-[var(--wk-border-subtle)]",
        "bg-[var(--wk-surface-page)]",
        "transition-all duration-[var(--wk-duration-base)] ease-[var(--wk-ease-default)]",
        sidebarOpen ? "w-60" : "w-16"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-[var(--wk-border-subtle)]">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--wk-radius-lg)] bg-[var(--wk-text-primary)]">
          <span className="text-sm font-bold text-[var(--wk-surface-page)]">
            V
          </span>
        </div>
        {sidebarOpen && (
          <span className="font-display text-lg font-semibold tracking-tight">
            Valet
          </span>
        )}
      </div>

      {/* User info */}
      {user && sidebarOpen && (
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--wk-border-subtle)]">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name}
              className="h-7 w-7 rounded-[var(--wk-radius-full)] object-cover shrink-0"
            />
          ) : (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--wk-radius-full)] bg-[var(--wk-surface-sunken)] text-[var(--wk-text-secondary)]">
              <User className="h-3.5 w-3.5" />
            </div>
          )}
          <span className="text-sm font-medium text-[var(--wk-text-primary)] truncate">
            {user.name}
          </span>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                "group relative flex items-center gap-3 px-3 py-2.5 rounded-[var(--wk-radius-lg)] text-sm font-medium",
                "transition-all duration-200 ease-[var(--wk-ease-default)]",
                isActive
                  ? "bg-[var(--wk-surface-raised)] text-[var(--wk-text-primary)]"
                  : "text-[var(--wk-text-secondary)] hover:bg-[var(--wk-surface-raised)] hover:text-[var(--wk-text-primary)]",
                !sidebarOpen && "justify-center"
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
                {sidebarOpen && (
                  <span className="transition-transform duration-200 ease-[var(--wk-ease-default)] group-hover:translate-x-0.5">
                    {item.label}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom controls */}
      <div className="px-2 py-4 border-t border-[var(--wk-border-subtle)] space-y-1">
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className={cn(
            "flex items-center gap-3 w-full px-3 py-2.5 rounded-[var(--wk-radius-lg)] text-sm font-medium",
            "text-[var(--wk-text-secondary)] hover:bg-[var(--wk-surface-raised)] hover:text-[var(--wk-text-primary)]",
            "transition-all duration-200 ease-[var(--wk-ease-default)]",
            !sidebarOpen && "justify-center"
          )}
        >
          {theme === "dark" ? (
            <Sun className="h-5 w-5 shrink-0" />
          ) : (
            <Moon className="h-5 w-5 shrink-0" />
          )}
          {sidebarOpen && (
            <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          )}
        </button>

        <button
          onClick={toggleSidebar}
          className={cn(
            "flex items-center gap-3 w-full px-3 py-2.5 rounded-[var(--wk-radius-lg)] text-sm font-medium",
            "text-[var(--wk-text-secondary)] hover:bg-[var(--wk-surface-raised)] hover:text-[var(--wk-text-primary)]",
            "transition-all duration-200 ease-[var(--wk-ease-default)]",
            !sidebarOpen && "justify-center"
          )}
        >
          {sidebarOpen ? (
            <PanelLeftClose className="h-5 w-5 shrink-0" />
          ) : (
            <PanelLeft className="h-5 w-5 shrink-0" />
          )}
          {sidebarOpen && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
