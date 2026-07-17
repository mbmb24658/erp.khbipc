import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export type UserRole = "admin" | "moderator" | "user";

export interface RoleCheckResult {
  isAuthorized: boolean;
  role: UserRole;
  canEdit: boolean;
  error?: string;
}

// Check if the current user has the required role
// Usage: const { isAuthorized, canEdit, error } = await checkRole(req, ["admin", "moderator"]);
// - For read-only endpoints: checkRole(req) — any authenticated user can access
// - For write endpoints: checkRole(req, ["admin", "moderator"]) — only admin and moderator
// - For admin-only endpoints: checkRole(req, ["admin"])
export async function checkRole(
  allowedRoles?: UserRole[]
): Promise<RoleCheckResult> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return { isAuthorized: false, role: "user", canEdit: false, error: "Unauthorized" };
  }

  const role = ((session.user as any)?.role || "user") as UserRole;

  // If no roles specified, any authenticated user can access (read-only)
  if (!allowedRoles) {
    return { isAuthorized: true, role, canEdit: role !== "user" };
  }

  // Check if user's role is in the allowed list
  if (!allowedRoles.includes(role)) {
    return {
      isAuthorized: false,
      role,
      canEdit: role !== "user",
      error: "Forbidden: شما دسترسی به این بخش ندارید",
    };
  }

  return { isAuthorized: true, role, canEdit: role !== "user" };
}

// Helper for write operations (POST, PUT, DELETE)
// Only admin and moderator can write
export async function checkWriteAccess(): Promise<RoleCheckResult> {
  return checkRole(["admin", "moderator"]);
}

// Helper for admin-only operations
export async function checkAdminAccess(): Promise<RoleCheckResult> {
  return checkRole(["admin"]);
}
