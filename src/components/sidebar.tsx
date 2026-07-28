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
  AlertCircle,
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
  FileBarChart,
  UserCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "داشبورد", icon: LayoutDashboard, exact: true, roles: ["admin", "moderator", "user"] },
  { href: "/portfolio", label: "کارپوشه", icon: UserCircle, exact: true, roles: ["admin", "moderator", "user"] },
  { href: "/financial-dashboard", label: "داشبورد مالی", icon: DollarSign, roles: ["admin", "moderator", "user"] },
  { href: "/wbs", label: "PMS جامع سازمان", icon: Network, roles: ["admin", "moderator", "user"] },
  { href: "/progress-update", label: "به‌روزرسانی پیشرفت", icon: Activity, roles: ["admin", "moderator", "user"] },
  { href: "/hr", label: "منابع انسانی", icon: Users, roles: ["admin", "moderator", "user"] },
  { href: "/financial", label: "مدیریت مالی", icon: DollarSign, roles: ["admin", "moderator", "user"] },
  { href: "/assets", label: "دارایی‌ها", icon: Package, roles: ["admin", "moderator", "user"] },
  { href: "/executors", label: "مجریان", icon: Briefcase, roles: ["admin", "moderator", "user"] },
  { href: "/activities", label: "فعالیت‌های جاری", icon: Activity, roles: ["admin", "moderator", "user"] },
  { href: "/issues", label: "نظام مسائل", icon: AlertCircle, roles: ["admin", "moderator", "user"] },
  { href: "/reports", label: "گزارشات", icon: FileBarChart, roles: ["admin", "moderator", "user"] },
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
  const [moduleAccess, setModuleAccess] = useState<string[] | null>(null);
  const [fetchedAccess, setFetchedAccess] = useState(false);

  // Fetch moduleAccess from API on every mount (not from JWT which may be stale)
  useEffect(() => {
    if (userRole === "admin" || !session?.user) {
      setFetchedAccess(true);
      return;
    }
    const userId = (session.user as any).id;
    if (!userId) {
      setFetchedAccess(true);
      return;
    }
    fetch(`/api/user/${userId}/module-access`)
      .then((res) => res.ok ? res.json() : { modules: null })
      .then((data) => {
        setModuleAccess(data.modules);
        setFetchedAccess(true);
      })
      .catch(() => {
        setModuleAccess(null);
        setFetchedAccess(true);
      });
  }, [session, userRole]);

  // Filter nav items
  const visibleItems = navItems.filter((item) => {
    if (userRole === "admin") return true;
    if (moduleAccess !== null) {
      // Custom module access is set
      // Special case: financial-dashboard and financial are linked
      if (item.href === "/financial-dashboard" && moduleAccess.includes("/financial")) return true;
      if (item.href === "/financial" && moduleAccess.includes("/financial-dashboard")) return true;
      return moduleAccess.includes(item.href);
    }
    // Fall back to role-based filtering
    return item.roles.includes(userRole);
  });

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
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground border-l border-sidebar-border/50">
      {/* Logo — glassmorphism header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-sidebar-border/50 glass">
        <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <Building2 className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-tight tracking-tight">شرکت خوارزمی</p>
          <p className="text-[11px] text-muted-foreground leading-tight">بندر امام</p>
        </div>
      </div>

      {/* Nav — clean, spacious, with smooth transitions */}
      <ScrollArea className="flex-1 px-2.5 py-3">
        <nav className="space-y-0.5">
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
                  "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-primary/20"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                )}
              >
                <Icon className={cn(
                  "w-[18px] h-[18px] shrink-0 transition-transform duration-200",
                  isActive ? "scale-110" : "group-hover:scale-105"
                )} />
                <span className="flex-1 truncate text-[13px]">{item.label}</span>
                {isNotifications && <NotificationBadge />}
                {isActive && (
                  <div className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-1 h-6 rounded-l-full bg-sidebar-primary" />
                )}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      {/* User — glassmorphism footer */}
      <div className="border-t border-sidebar-border/50 p-2.5 glass">
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
    <div className="flex items-center gap-3 p-2.5 rounded-xl bg-sidebar-accent/40 hover:bg-sidebar-accent/60 transition-colors">
      <Avatar className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 text-white ring-2 ring-background/50">
        <AvatarFallback className="bg-transparent">{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{name}</p>
        <p className="text-[11px] text-muted-foreground truncate">
          {role === "admin" ? "مدیر سیستم" : role === "moderator" ? "ناظر" : "کاربر"}
        </p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => signOut({ callbackUrl: "/login" })}
        title="خروج"
        className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors"
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
        {/* Top bar — glassmorphism */}
        <header className="h-14 border-b border-border/50 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 flex items-center px-4 lg:px-6 gap-3">
          <Button
            size="icon"
            variant="ghost"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex-1 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="text-sm font-semibold text-muted-foreground tracking-tight">
              سامانه مدیریت یکپارچه
            </h1>
          </div>
          <ThemeToggle />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="hidden sm:flex text-muted-foreground hover:text-destructive"
          >
            <LogOut className="w-4 h-4 ml-1" />
            خروج
          </Button>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
          {/* Footer with creator name */}
          <footer className="mt-12 pt-6 border-t border-border/50 text-center">
            <p className="text-xs text-muted-foreground/70 tracking-wide">
              طراحی و توسعه: محمد بلدزاده
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
