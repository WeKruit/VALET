import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell, User, LogOut, Settings, ChevronDown } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { cn } from "@/lib/utils";

const ROUTE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/tasks": "Applications",
  "/apply": "New Application",
  "/settings": "Settings",
};

function getPageTitle(pathname: string): string {
  // Exact match first
  if (ROUTE_TITLES[pathname]) return ROUTE_TITLES[pathname];

  // Task detail page
  if (pathname.startsWith("/tasks/")) return "Application Detail";

  // Settings sub-routes
  if (pathname.startsWith("/settings")) return "Settings";

  return "Dashboard";
}

export function Header() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const pageTitle = getPageTitle(location.pathname);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [menuOpen]);

  return (
    <header className="flex items-center justify-between h-14 px-6 border-b border-[var(--wk-border-subtle)] bg-[var(--wk-surface-page)]">
      {/* Page title */}
      <h2 className="text-sm font-medium text-[var(--wk-text-secondary)]">
        {pageTitle}
      </h2>

      <div className="flex items-center gap-2">
        {/* Notifications */}
        <button className="relative flex items-center justify-center h-9 w-9 rounded-[var(--wk-radius-lg)] text-[var(--wk-text-secondary)] hover:bg-[var(--wk-surface-raised)] transition-colors duration-150">
          <Bell className="h-5 w-5" />
        </button>

        {/* User menu */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((prev) => !prev)}
            className={cn(
              "flex items-center gap-2 h-9 pl-1 pr-2 rounded-[var(--wk-radius-lg)]",
              "hover:bg-[var(--wk-surface-raised)] transition-colors duration-150",
              menuOpen && "bg-[var(--wk-surface-raised)]"
            )}
          >
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="h-7 w-7 rounded-[var(--wk-radius-full)] object-cover"
              />
            ) : (
              <div className="flex items-center justify-center h-7 w-7 rounded-[var(--wk-radius-full)] bg-[var(--wk-surface-sunken)] text-[var(--wk-text-secondary)]">
                <User className="h-4 w-4" />
              </div>
            )}
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-[var(--wk-text-tertiary)] transition-transform duration-150",
                menuOpen && "rotate-180"
              )}
            />
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <div
              className={cn(
                "absolute right-0 top-full mt-1 w-48 py-1",
                "bg-[var(--wk-surface-white)] text-[var(--wk-text-primary)]",
                "rounded-[var(--wk-radius-lg)]",
                "border border-[var(--wk-border-default)]",
                "shadow-[var(--wk-shadow-lg)]",
                "z-50",
                "animate-in fade-in-0 zoom-in-95 duration-100"
              )}
            >
              {user && (
                <div className="px-3 py-2 border-b border-[var(--wk-border-subtle)]">
                  <p className="text-sm font-medium truncate">{user.name}</p>
                  <p className="text-xs text-[var(--wk-text-tertiary)] truncate">
                    {user.email}
                  </p>
                </div>
              )}
              <button
                onClick={() => {
                  setMenuOpen(false);
                  navigate("/settings");
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[var(--wk-text-secondary)] hover:bg-[var(--wk-surface-raised)] hover:text-[var(--wk-text-primary)] transition-colors duration-100"
              >
                <User className="h-4 w-4" />
                Profile
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  navigate("/settings");
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[var(--wk-text-secondary)] hover:bg-[var(--wk-surface-raised)] hover:text-[var(--wk-text-primary)] transition-colors duration-100"
              >
                <Settings className="h-4 w-4" />
                Settings
              </button>
              <div className="my-1 h-px bg-[var(--wk-border-subtle)]" />
              <button
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[var(--wk-status-error)] hover:bg-[var(--wk-surface-raised)] transition-colors duration-100"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
