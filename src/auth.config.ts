/**
 * Edge-safe Auth.js config.
 *
 * This file MUST NOT import the Prisma adapter (or anything that pulls in
 * `pg` / `@prisma/client`), because it is consumed by `middleware.ts`, which
 * runs on the Edge runtime. The full config (adapter + secrets + callbacks
 * that need DB access) lives in `src/auth.ts`.
 */
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Scopes we request from Google:
 *   - openid, email, profile: identity
 *   - calendar.readonly: needed for GCal sync (ingestion only — ChronoFlow
 *     does not write back to Google Calendar yet)
 */
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");

export const authConfig = {
  pages: {
    signIn: "/signin",
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: GOOGLE_SCOPES,
          // `offline` + `consent` together are what force Google to return
          // a refresh_token on every login. Without `prompt=consent`, Google
          // only returns one on the very first consent, and if the user
          // disconnects/reconnects we'd get a silent failure later.
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    /**
     * Route guard used by middleware. Returning `true` = allow, `false` =
     * redirect to signIn, a Response = short-circuit.
     *
     * (app)/* is authenticated-only; everything else is public.
     */
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const needsAuth =
        nextUrl.pathname.startsWith("/calendar") ||
        nextUrl.pathname.startsWith("/tasks") ||
        nextUrl.pathname.startsWith("/onboarding") ||
        nextUrl.pathname.startsWith("/review");
      if (needsAuth) return isLoggedIn;
      return true;
    },
  },
} satisfies NextAuthConfig;
