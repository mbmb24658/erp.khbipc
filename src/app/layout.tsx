import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import localFont from "next/font/local";
import { Providers } from "@/components/providers";
import { ThemeProvider } from "@/components/theme-provider";

const vazirmatn = localFont({
  src: [
    { path: "../../public/fonts/Vazirmatn-Regular.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/Vazirmatn-Medium.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/Vazirmatn-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-vazirmatn",
  display: "swap",
});

export const metadata: Metadata = {
  title: "سامانه مدیریت یکپارچه شرکت خوارزمی بندر امام",
  description: "سیستم یکپارچه مدیریت و پایش شرکت خوارزمی بندر امام",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className={`${vazirmatn.variable} antialiased bg-background text-foreground`}>
        <ThemeProvider>
          <Providers>{children}</Providers>
        </ThemeProvider>
        <Toaster />
      </body>
    </html>
  );
}
