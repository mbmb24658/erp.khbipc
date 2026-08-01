"use client";
import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";
import { ModernModeProvider } from "@/components/modern/modern-mode-provider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ModernModeProvider>{children}</ModernModeProvider>
    </SessionProvider>
  );
}
