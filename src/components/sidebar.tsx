"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Building2,
  LayoutDashboard,
  Network,
  Users,
  DollarSign,
  Package,
  Target,
  AlertTriangle,
  Bell,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  Sun,
  Moon,
  Activity,
  Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "داشبورد", icon: LayoutDashboard, exact: true, roles: ["admin", "moderator", "user"] },
  { href: "/financial-dashboard", label: "داشبورد مالی", icon: DollarSign, roles: ["admin", "moderator", "user"] },
  { href: "/wbs", label: "ساختار شکست کار (WBS)", icon: Network, roles: ["admin", "moderator", "user"] },
  { href: "/progress-update", label: "به‌روزرسانی پیشرفت", icon: Activity, roles: ["admin", "moderator", "user"] },
  { href: "/hr", label: "منابع انسانی", icon: Users, roles: ["admin", "moderator", "user"] },
  { href: "/financial", label: "مدیریت مالی", icon: DollarSign, roles: ["admin", "moderator", "user"] },
  { href: "/assets", label: "دارایی‌ها", icon: Package, roles: ["admin", "moderator", "user"] },
  { href: "/executors", label: "مجریان", icon: Briefcase, roles: ["admin", "moderator", "user"] },
  { href: "/activities", label: "فعالیت‌های جاری", icon: Activity, roles: ["admin", "moderator", "user"] },
  { href: "/kpi", label: "ارزیابی عملکرد (KPI)", icon: Target, roles: ["admin", "moderator", "user"] },
  { href: "/personnel-evaluation", label: "ارزیابی پرسنل", icon: Target, roles: ["admin", "moderator", "user"] },
  { href: "/risks", label: "مدیریت ریسک", icon: AlertTriangle, roles: ["admin", "moderator", "user"] },
  { href: "/notifications", label: "اعلان‌ها", icon: Bell, roles: ["admin", "moderator", "user"] },
  { href: "/charts", label: "چارت‌ها و منحنی S", icon: BarChart3, roles: ["admin"] },
  { href: "/settings", label: "تنظیمات و کاربران", icon: Settings, roles: ["admin"] },
];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const isDark = theme === "dark";
  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={isDark ? "حالت روشن" : "حالت تیره"}
      className="h-9 w-9"
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role || "user";

  // Filter nav items based on user role
  const visibleItems = navItems.filter((item) => item.roles.includes(userRole));

  // Determine active state — special case: financial and financial-dashboard are linked
  const isItemActive = (item: typeof navItems[0]) => {
    if (item.exact) return pathname === item.href;
    // Financial dashboard and financial management are linked
    if (item.href === "/financial-dashboard") {
      return pathname === "/financial-dashboard" || pathname.startsWith("/financial");
    }
    if (item.href === "/financial") {
      return pathname === "/financial-dashboard" || pathname.startsWith("/financial");
    }
    return pathname.startsWith(item.href);
  };

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex items-center gap-3 p-5 border-b border-sidebar-border">
        <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow">
          <Building2 className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-tight">شرکت خوارزمی</p>
          <p className="text-xs text-muted-foreground leading-tight">بندر امام</p>
        </div>
      </div>

      {/* Nav */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {visibleItems.map((item) => {
            const isActive = isItemActive(item);
            const Icon = item.icon;
            const isNotifications = item.href === "/notifications";
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors relative",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                {isNotifications && <NotificationBadge />}
                {!isActive && !isNotifications && <ChevronLeft className="w-3 h-3 opacity-50" />}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      {/* User */}
      <div className="border-t border-sidebar-border p-3">
        <UserCard />
      </div>
    </div>
  );
}

// Badge showing unread notification count
function NotificationBadge() {
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    const fetchCount = async () => {
      try {
        const res = await fetch("/api/notification?unread=true");
        if (res.ok) {
          const data = await res.json();
          setCount(Array.isArray(data) ? data.length : 0);
        }
      } catch {
        // ignore
      }
    };
    fetchCount();
    // Poll every 60 seconds
    interval = setInterval(fetchCount, 60000);
    return () => clearInterval(interval);
  }, []);

  if (count === 0) return null;
  return (
    <span className="absolute left-1 top-1/2 -translate-y-1/2 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
      {count > 99 ? "۹۹+" : count.toLocaleString("fa-IR")}
    </span>
  );
}

function UserCard() {
  const { data: session } = useSession();
  const name = session?.user?.name || "کاربر";
  const role = (session?.user as any)?.role || "user";
  const initials = name.charAt(0);

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-sidebar-accent/50">
      <Avatar className="w-9 h-9 bg-emerald-500 text-white">
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {role === "admin" ? "مدیر سیستم" : role === "moderator" ? "ناظر" : "کاربر"}
        </p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => signOut({ callbackUrl: "/login" })}
        title="خروج"
        className="h-8 w-8"
      >
        <LogOut className="w-4 h-4" />
      </Button>
    </div>
  );
}

export function SidebarWrapper({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 border-l border-sidebar-border">
        <Sidebar />
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute right-0 top-0 bottom-0 w-64 shadow-xl">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 flex items-center px-4 lg:px-6 gap-3">
          <Button
            size="icon"
            variant="ghost"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-sm font-semibold text-muted-foreground">
              سامانه مدیریت یکپارچه
            </h1>
          </div>
          <ThemeToggle />
          <Button
            size="sm"
            variant="outline"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="hidden sm:flex"
          >
            <LogOut className="w-4 h-4 ml-1" />
            خروج
          </Button>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
          {/* Footer with creator name */}
          <footer className="mt-8 pt-4 border-t text-center text-xs text-muted-foreground">
            طراحی و توسعه: محمد بلدزاده
          </footer>
        </main>
      </div>
    </div>
  );
}
