import { NavLink, Outlet } from "react-router-dom";
import { Users, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

const operationAdminNav = [
  { path: "/operation-admin/early-access", label: "Early Access", icon: Users },
  { path: "/operation-admin/email-templates", label: "Email Templates", icon: Mail },
];

export function OperationAdminLayout() {
  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-[var(--wk-border-subtle)] bg-[var(--wk-surface-page)]">
        <div className="px-4 py-5 border-b border-[var(--wk-border-subtle)]">
          <h2 className="font-display text-sm font-semibold text-[var(--wk-text-primary)]">
            Operations
          </h2>
          <p className="mt-0.5 text-xs text-[var(--wk-text-tertiary)]">Admin tools</p>
        </div>
        <nav aria-label="Operations admin navigation" className="flex-1 px-2 py-3 space-y-0.5">
          {operationAdminNav.map((item) => (
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
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[var(--wk-accent-amber)] transition-all duration-200" />
                  )}
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="transition-transform duration-200 ease-[var(--wk-ease-default)] group-hover:translate-x-0.5">
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Mobile nav bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-10 flex border-b border-[var(--wk-border-subtle)] bg-[var(--wk-surface-page)] px-2">
        {operationAdminNav.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 px-3 py-3 text-xs font-medium border-b-2",
                "transition-colors duration-200",
                isActive
                  ? "border-[var(--wk-accent-amber)] text-[var(--wk-text-primary)]"
                  : "border-transparent text-[var(--wk-text-secondary)] hover:text-[var(--wk-text-primary)]",
              )
            }
          >
            <item.icon className="h-3.5 w-3.5" />
            {item.label}
          </NavLink>
        ))}
      </div>

      {/* Content area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 md:pt-6 pt-14">
        <Outlet />
      </main>
    </div>
  );
}
