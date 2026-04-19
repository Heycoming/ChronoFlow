/**
 * Full Auth.js config (server-only — not edge-safe).
 *
 * Uses the Prisma adapter so sessions, accounts, and users persist to the
 * ChronoFlow DB. Consumers:
 *   - `src/app/api/auth/[...nextauth]/route.ts` for Auth.js HTTP handlers
 *   - Server components / route handlers calling `auth()` to get the session
 *   - `signIn()` / `signOut()` server actions
 */
import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { authConfig } from "@/auth.config";

export const {
  handlers,
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  /**
   * JWT sessions (required): our `proxy.ts` runs on the Edge runtime and
   * must be able to verify the session cookie without hitting Postgres.
   * Database sessions would make the proxy silently fall back to JWT
   * strategy (via authConfig without the adapter) and fail to decrypt
   * the DB-session-token cookie → user gets kicked to /signin on every
   * client-side navigation. Keeping PrismaAdapter means Google tokens
   * still persist to the Account table at sign-in.
   */
  session: { strategy: "jwt" },
  callbacks: {
    ...authConfig.callbacks,
    /**
     * Runs at sign-in (with `account`/`user` populated) and on every
     * subsequent token refresh. We cache the user id and — just for the
     * convenience of server components — the Google tokens themselves.
     */
    async jwt({ token, user, account }) {
      if (user?.id) token.sub = user.id;
      if (account?.provider === "google") {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpiresAt = account.expires_at;
      }
      return token;
    },
    /**
     * The shape visible to server components via `auth()`. We expose the
     * user id plus Google tokens so downstream calls (GCal sync, etc.)
     * don't need a separate DB round-trip — though they *can* refetch
     * from the Account row when the token is close to expiry.
     */
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      session.accessToken = token.accessToken as string | undefined;
      session.refreshToken = token.refreshToken as string | undefined;
      session.accessTokenExpiresAt = token.accessTokenExpiresAt as
        | number
        | undefined;
      return session;
    },
  },
});
