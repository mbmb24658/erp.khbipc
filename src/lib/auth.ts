import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "./db";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        username: { label: "نام کاربری", type: "text" },
        password: { label: "رمز عبور", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }
        try {
          // Try to find user — use select to avoid issues with new columns
          const user = await db.user.findUnique({
            where: { username: credentials.username },
            include: { role: true, personel: true },
          });
          if (!user || !user.isActive) {
            return null;
          }
          const ok = bcrypt.compareSync(credentials.password, user.passwordHash);
          if (!ok) {
            return null;
          }

          // Try to update lastLoginAt — wrap in try-catch in case new columns don't exist
          try {
            await db.user.update({
              where: { id: user.id },
              data: { lastLoginAt: new Date() },
            });
          } catch (e) {
            // Ignore — column might not exist yet
          }

          // Get moduleAccess safely
          let moduleAccess: string | null = null;
          try {
            moduleAccess = (user as any).moduleAccess || null;
          } catch {
            // Ignore
          }

          return {
            id: user.id,
            name: user.personel?.name || user.username,
            email: user.email || undefined,
            role: user.role?.name || "user",
            username: user.username,
            moduleAccess,
          } as any;
        } catch (e: any) {
          console.error("[auth] ERROR:", e.message);
          return null;
        }
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.username = (user as any).username;
        token.moduleAccess = (user as any).moduleAccess;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
        (session.user as any).username = token.username;
        (session.user as any).id = token.sub;
        (session.user as any).moduleAccess = token.moduleAccess;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || "kharazmi-secret-key-2026",
};
