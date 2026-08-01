"use client";
import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Building2, Loader2, Sparkles } from "lucide-react";
import { FloatingLines } from "@/components/modern/floating-lines";
import { useModernMode } from "@/components/modern/modern-mode-provider";
import { ElectricBorder } from "@/components/modern/electric-border";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { isModern, toggleModern } = useModernMode();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("نام کاربری یا رمز عبور نادرست است");
    } else {
      router.push(searchParams.get("callbackUrl") || "/");
      router.refresh();
    }
  };

  // The login page always shows the modern aesthetic — it's the first
  // impression users get of the system, so we keep the floating lines
  // and electric border regardless of the saved preference. Users can
  // toggle modern mode off from the in-app header after logging in.
  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden bg-gradient-to-br from-emerald-50 to-teal-100">
      {/* Floating lines background (always shown on login for the modern aesthetic) */}
      <FloatingLines
        lineCount={22}
        speed={0.4}
        colors={["#10b981", "#3b82f6", "#8b5cf6", "#06b6d4"]}
        thickness={1.5}
        opacity={0.45}
        interactive
      />

      {/* Modern mode toggle in corner */}
      <button
        onClick={toggleModern}
        className={`absolute top-4 left-4 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
          isModern
            ? "bg-primary text-primary-foreground shadow-lg"
            : "bg-white/80 backdrop-blur text-foreground hover:bg-white shadow"
        }`}
      >
        <Sparkles className="w-3.5 h-3.5" />
        {isModern ? "حالت مدرن فعال" : "حالت مدرن"}
      </button>

      {/* Login card with ElectricBorder */}
      <div className="w-full max-w-md relative z-10">
        <ElectricBorder
          color="#10b981"
          speed={1.4}
          chaos={0.18}
          thickness={2.5}
          borderRadius={20}
          enabled
        >
          <Card className="shadow-2xl border-0 backdrop-blur-xl bg-card/95">
            <CardHeader className="text-center space-y-3 pt-6">
              <div className="mx-auto w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <Building2 className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-2xl font-bold">ورود به سامانه</CardTitle>
              <p className="text-sm text-muted-foreground">
                سیستم یکپارچه مدیریت شرکت خوارزمی بندر امام
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">نام کاربری</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin"
                    required
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">رمز عبور</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    required
                  />
                </div>
                {error && (
                  <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                    {error}
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
                  ورود
                </Button>
                <div className="text-xs text-muted-foreground text-center bg-muted p-3 rounded-md">
                  <p>برای دسترسی اولیه:</p>
                  <p className="font-mono mt-1">admin / admin123</p>
                </div>
              </form>
            </CardContent>
          </Card>
        </ElectricBorder>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100 p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            در حال بارگذاری...
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
