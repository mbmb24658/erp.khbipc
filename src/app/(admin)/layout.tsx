import { SidebarWrapper } from "@/components/sidebar";
import { ActivityTracker } from "@/components/activity-tracker";
import { CommandPalette } from "@/components/command-palette";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <SidebarWrapper>
      {children}
      <ActivityTracker />
      <CommandPalette />
    </SidebarWrapper>
  );
}
