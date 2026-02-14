import { Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface UpgradeCtaProps {
  collapsed?: boolean;
}

export function UpgradeCta({ collapsed }: UpgradeCtaProps) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate("/pricing")}
      title={collapsed ? "Upgrade plan" : undefined}
      aria-label="Upgrade plan"
      className={cn(
        "flex items-center gap-3 w-full px-3 py-2.5 rounded-[var(--wk-radius-lg)] text-sm font-medium cursor-pointer",
        "bg-[var(--wk-accent-amber)]/10 text-[var(--wk-accent-amber)]",
        "hover:bg-[var(--wk-accent-amber)]/20",
        "transition-all duration-200 ease-[var(--wk-ease-default)]",
        collapsed && "justify-center"
      )}
    >
      <Sparkles className="h-5 w-5 shrink-0" />
      {!collapsed && <span>Upgrade</span>}
    </button>
  );
}
