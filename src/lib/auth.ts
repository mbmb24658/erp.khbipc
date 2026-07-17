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
        console.log("[auth] authorize() called", {
          username: credentials?.username,
          hasPassword: !!credentials?.password,
          dbPath: process.env.DATABASE_URL,
        });
        if (!credentials?.username || !credentials?.password) {
          console.log("[auth] missing username or password");
          return null;
        }
        try {
          const user = await db.user.findUnique({
            where: { username: credentials.username },
            include: { role: true, personel: true },
          });
          console.log("[auth] user lookup:", user ? `found (id=${user.id}, active=${user.isActive})` : "NOT FOUND");
          if (!user || !user.isActive) {
            console.log("[auth] returning null: user not found or inactive");
            return null;
          }
          const ok = bcrypt.compareSync(credentials.password, user.passwordHash);
          console.log("[auth] bcrypt compare result:", ok);
          if (!ok) {
            console.log("[auth] returning null: wrong password");
            return null;
          }
          await db.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          });
          console.log("[auth] SUCCESS - returning user");
          return {
            id: user.id,
            name: user.personel?.name || user.username,
            email: user.email || undefined,
            role: user.role?.name || "user",
            username: user.username,
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
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
        (session.user as any).username = token.username;
        (session.user as any).id = token.sub;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || "kharazmi-secret-key-2026",
};
