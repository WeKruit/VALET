import { Briefcase, Search, FileText, PenTool, Gift, RotateCcw, Coins } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { LucideIcon } from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  task_application: Briefcase,
  batch_application: Briefcase,
  premium_analysis: Search,
  resume_optimization: FileText,
  cover_letter: PenTool,
  referral_reward: Gift,
  refund: RotateCcw,
  admin_grant: Coins,
  signup_bonus: Coins,
};

export function getLedgerIcon(reason: string): LucideIcon {
  return iconMap[reason] ?? Coins;
}

const badgeMap: Record<string, "success" | "info" | "secondary"> = {
  referral_reward: "success",
  admin_grant: "success",
  signup_bonus: "success",
  refund: "info",
  task_application: "secondary",
  batch_application: "secondary",
  premium_analysis: "secondary",
  resume_optimization: "secondary",
  cover_letter: "secondary",
};

export function getLedgerBadgeVariant(reason: string): "success" | "info" | "secondary" {
  return badgeMap[reason] ?? "secondary";
}

export function formatRelativeTime(date: Date | string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}
