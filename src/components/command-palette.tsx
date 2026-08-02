"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  UserCircle,
  DollarSign,
  Network,
  Activity,
  Users,
  Package,
  Target,
  AlertTriangle,
  AlertCircle,
  Bell,
  BarChart3,
  Settings,
  Briefcase,
  FileBarChart,
  Search,
  Plus,
  Home,
} from "lucide-react";

// ============================================================
// CommandPalette — Cmd+K / Ctrl+K quick navigation
// Inspired by Linear / Vercel / Raycast
//
// Features:
//   - Opens with Cmd+K (Mac) or Ctrl+K (Windows/Linux)
//   - Fuzzy search across all pages
//   - Grouped by category
//   - Quick actions (e.g., "Go to dashboard", "Search activities")
// ============================================================

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string[];
  group: string;
}

const navItems: NavItem[] = [
  // Main
  { label: "داشبورد", href: "/", icon: LayoutDashboard, group: "اصلی", keywords: ["خانه", "داشبورد", "dashboard", "home"] },
  { label: "کارپوشه", href: "/portfolio", icon: UserCircle, group: "اصلی", keywords: ["پورتفولیو", "کارپوشه", "portfolio", "workspace"] },
  // PMS
  { label: "PMS جامع سازمان", href: "/wbs", icon: Network, group: "مدیریت پروژه", keywords: ["wbs", "pms", "پروژه", "ساختار"] },
  { label: "به‌روزرسانی پیشرفت", href: "/progress-update", icon: Activity, group: "مدیریت پروژه", keywords: ["پیشرفت", "progress", "update"] },
  { label: "فعالیت‌های جاری", href: "/activities", icon: Activity, group: "مدیریت پروژه", keywords: ["activity", "فعالیت", "task"] },
  { label: "مجریان", href: "/executors", icon: Briefcase, group: "مدیریت پروژه", keywords: ["مجری", "executor"] },
  // HR
  { label: "منابع انسانی", href: "/hr", icon: Users, group: "منابع انسانی", keywords: ["hr", "پرسنل", "personnel"] },
  { label: "ارزیابی پرسنل", href: "/personnel-evaluation", icon: Target, group: "منابع انسانی", keywords: ["ارزیابی", "evaluation", "kpi"] },
  { label: "ارزیابی عملکرد (KPI)", href: "/kpi", icon: Target, group: "منابع انسانی", keywords: ["kpi", "شاخص", "عملکرد"] },
  // Financial
  { label: "داشبورد مالی", href: "/financial-dashboard", icon: DollarSign, group: "مالی", keywords: ["مالی", "financial", "dashboard"] },
  { label: "مدیریت مالی", href: "/financial", icon: DollarSign, group: "مالی", keywords: ["هزینه", "درآمد", "cost", "revenue"] },
  { label: "دارایی‌ها", href: "/assets", icon: Package, group: "مالی", keywords: ["دارایی", "asset"] },
  // Risk & Issues
  { label: "مدیریت ریسک", href: "/risks", icon: AlertTriangle, group: "ریسک و مسائل", keywords: ["risk", "ریسک"] },
  { label: "نظام مسائل", href: "/issues", icon: AlertCircle, group: "ریسک و مسائل", keywords: ["issue", "مسئله", "مشکل"] },
  { label: "نقشه حرارتی ریسک", href: "/risks/heatmap", icon: AlertTriangle, group: "ریسک و مسائل", keywords: ["heatmap", "حرارتی"] },
  { label: "درس‌های آموخته", href: "/risks/lessons", icon: FileBarChart, group: "ریسک و مسائل", keywords: ["lessons", "درس"] },
  // System
  { label: "گزارشات", href: "/reports", icon: FileBarChart, group: "سیستم", keywords: ["report", "گزارش"] },
  { label: "چارت‌ها و منحنی S", href: "/charts", icon: BarChart3, group: "سیستم", keywords: ["chart", "چارت", "s-curve"] },
  { label: "اعلان‌ها", href: "/notifications", icon: Bell, group: "سیستم", keywords: ["notification", "اعلان"] },
  { label: "تنظیمات و کاربران", href: "/settings", icon: Settings, group: "سیستم", keywords: ["settings", "تنظیمات", "users"] },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((p) => !p);
      }
      // Also support "/" for quick focus
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        const target = e.target as HTMLElement;
        const tag = target.tagName.toLowerCase();
        if (tag !== "input" && tag !== "textarea" && !target.isContentEditable) {
          e.preventDefault();
          setOpen(true);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Group items
  const grouped: Record<string, NavItem[]> = {};
  for (const item of navItems) {
    if (!grouped[item.group]) grouped[item.group] = [];
    grouped[item.group].push(item);
  }

  const handleSelect = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="جستجوی صفحه یا اقدام..." />
        <CommandList>
          <CommandEmpty>موردی یافت نشد</CommandEmpty>
          {Object.entries(grouped).map(([group, items]) => (
            <CommandGroup key={group} heading={group}>
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.href}
                    value={`${item.label} ${item.keywords?.join(" ") || ""}`}
                    onSelect={() => handleSelect(item.href)}
                    className="command-palette-item"
                  >
                    <Icon className="w-4 h-4 ml-2 text-muted-foreground" />
                    <span>{item.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
          <CommandSeparator />
          <CommandGroup heading="اکشن‌ها">
            <CommandItem
              onSelect={() => {
                setOpen(false);
                router.push("/activities");
              }}
              className="command-palette-item"
            >
              <Plus className="w-4 h-4 ml-2 text-muted-foreground" />
              <span>فعالیت جدید</span>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setOpen(false);
                router.push("/wbs");
              }}
              className="command-palette-item"
            >
              <Network className="w-4 h-4 ml-2 text-muted-foreground" />
              <span>ساختار WBS</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      {/* Floating search button — visible on all pages */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 left-5 z-40 group flex items-center gap-2 px-3 h-10 rounded-full bg-card border border-border shadow-lg hover:shadow-xl transition-all text-xs text-muted-foreground"
        title="جستجو (Ctrl+K)"
      >
        <Search className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
        <span className="hidden sm:inline">جستجو</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted text-[9px] font-mono">
          ⌘K
        </kbd>
      </button>
    </>
  );
}
