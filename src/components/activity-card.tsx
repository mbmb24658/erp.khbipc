"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  AlertCircle,
  Clock,
  Wrench,
  Network,
  CheckCircle2,
  Pause,
  Loader2,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// ActivityCard — variant-aware card for activities/tasks
//
// Variants determine the visual treatment (border accent, tint,
// icon, badge). Each activity type gets a distinct look so users
// can identify status at a glance.
//
// Variants:
//   overdue     — late activity (red)
//   current     — in progress (emerald)
//   corrective  — corrective action (violet)
//   pms         — PMS/WBS activity (indigo)
//   pending     — waiting (amber)
//   completed   — done (green, dimmed)
//   onhold      — paused (slate)
// ============================================================

export type ActivityVariant =
  | "overdue"
  | "current"
  | "corrective"
  | "pms"
  | "pending"
  | "completed"
  | "onhold";

export interface ActivityCardProps {
  variant: ActivityVariant;
  title: string;
  code?: string;
  description?: string;
  href?: string;
  assignee?: {
    name: string;
    initials?: string;
  };
  dueDate?: string;
  progressPct?: number; // 0-100
  badgeLabel?: string;
  badgeClassName?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children?: ReactNode;
  className?: string;
  onClick?: () => void;
}

// Variant → metadata (icon, badge text, badge class)
const variantMeta: Record<
  ActivityVariant,
  { Icon: React.ComponentType<{ className?: string }>; label: string; badgeClass: string }
> = {
  overdue: { Icon: AlertCircle, label: "عقب‌افتاده", badgeClass: "badge-overdue" },
  current: { Icon: Loader2, label: "در حال انجام", badgeClass: "badge-current" },
  corrective: { Icon: Wrench, label: "اصلاحی", badgeClass: "badge-corrective" },
  pms: { Icon: Network, label: "PMS", badgeClass: "badge-pms" },
  pending: { Icon: Clock, label: "در انتظار", badgeClass: "badge-pending" },
  completed: { Icon: CheckCircle2, label: "تکمیل", badgeClass: "badge-completed" },
  onhold: { Icon: Pause, label: "متوقف", badgeClass: "badge-pending" },
};

// Pick progress bar color class based on value
function getProgressClass(pct: number): string {
  if (pct < 50) return "progress-track-low";
  if (pct < 80) return "progress-track-medium";
  return "progress-track-high";
}

// Detect overdue from dueDate (string ISO)
function isOverdue(dueDate?: string): boolean {
  if (!dueDate) return false;
  try {
    return new Date(dueDate).getTime() < Date.now();
  } catch {
    return false;
  }
}

// Smart variant detection: if status says "in_progress" but due date has passed,
// upgrade to "overdue"
export function detectVariant(
  status: string,
  dueDate?: string,
  isCorrective?: boolean,
  isPms?: boolean
): ActivityVariant {
  // Corrective takes precedence (special flag)
  if (isCorrective) return "corrective";
  // PMS type
  if (isPms) {
    if (status === "completed") return "completed";
    if (status === "on_hold") return "onhold";
    if (status === "in_progress") return "current";
    if (isOverdue(dueDate)) return "overdue";
    return "pms";
  }
  // Regular activity
  if (status === "completed") return "completed";
  if (status === "on_hold") return "onhold";
  if (status === "cancelled") return "onhold";
  if (isOverdue(dueDate)) return "overdue";
  if (status === "in_progress") return "current";
  return "pending";
}

export function ActivityCard({
  variant,
  title,
  code,
  description,
  href,
  assignee,
  dueDate,
  progressPct = 0,
  badgeLabel,
  badgeClassName,
  icon: CustomIcon,
  children,
  className,
  onClick,
}: ActivityCardProps) {
  const meta = variantMeta[variant];
  const Icon = CustomIcon || meta.Icon;
  const progressClass = getProgressClass(progressPct);

  // Format due date in Persian
  const dueDateLabel = dueDate
    ? new Date(dueDate).toLocaleDateString("fa-IR", {
        month: "short",
        day: "numeric",
      })
    : null;

  const isOverdueDue = variant === "overdue" && dueDate;

  // Build inner content
  const inner = (
    <div
      className={cn(
        "activity-card activity-card--" + variant,
        "p-4 cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      {/* Header: icon + title + badge */}
      <div className="flex items-start gap-3 mb-2">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: "color-mix(in oklch, var(--card-accent) 15%, transparent)",
            color: "var(--card-accent)",
          }}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            {code && (
              <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                {code}
              </span>
            )}
            <h3 className="text-sm font-semibold truncate">{title}</h3>
          </div>
          {description && (
            <p className="text-xs text-muted-foreground line-clamp-1">{description}</p>
          )}
        </div>
        <Badge className={cn("text-[10px] shrink-0", badgeClassName || meta.badgeClass)}>
          {badgeLabel || meta.label}
        </Badge>
      </div>

      {/* Body: progress + meta */}
      <div className="space-y-2">
        {progressPct > 0 && (
          <div className="flex items-center gap-2">
            <Progress
              value={progressPct}
              className={cn("h-1.5 flex-1", progressClass)}
            />
            <span className="text-[11px] font-bold font-num shrink-0 w-9 text-left">
              {Math.round(progressPct).toLocaleString("fa-IR")}٪
            </span>
          </div>
        )}

        {/* Footer: assignee + due date */}
        {(assignee || dueDateLabel) && (
          <div className="flex items-center justify-between gap-2 pt-1">
            {assignee ? (
              <div className="flex items-center gap-1.5 min-w-0">
                <Avatar className="w-5 h-5 bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                  <AvatarFallback className="bg-transparent text-[9px] font-bold">
                    {assignee.initials || assignee.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-[11px] text-muted-foreground truncate">
                  {assignee.name}
                </span>
              </div>
            ) : (
              <span />
            )}
            {dueDateLabel && (
              <div
                className={cn(
                  "flex items-center gap-1 text-[11px] shrink-0",
                  isOverdueDue ? "text-overdue font-semibold" : "text-muted-foreground"
                )}
                style={isOverdueDue ? { color: "var(--status-overdue)" } : undefined}
              >
                <Calendar className="w-3 h-3" />
                <span className="font-num">{dueDateLabel}</span>
              </div>
            )}
          </div>
        )}

        {children}
      </div>
    </div>
  );

  // Wrap with Link if href provided
  if (href) {
    return (
      <Link href={href} className="block no-underline">
        {inner}
      </Link>
    );
  }
  return inner;
}

// ============================================================
// StatusBadge — semantic badge
// ============================================================
export function StatusBadge({
  variant,
  label,
  className,
}: {
  variant: ActivityVariant;
  label?: string;
  className?: string;
}) {
  const meta = variantMeta[variant];
  return (
    <Badge className={cn("text-xs", meta.badgeClass, className)}>
      {label || meta.label}
    </Badge>
  );
}
