/**
 * Auth gate. In Next.js 16 this file is named `proxy.ts` (formerly
 * `middleware.ts`). Runs on the Edge runtime, so it MUST only import
 * the edge-safe config — `src/auth.config.ts`. Importing `src/auth.ts`
 * here would pull in Prisma and crash the Edge build.
 *
 * The `authorized` callback in auth.config decides who gets through.
 */
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

export default auth(() => {
  // The `authorized` callback already decided allow/deny; nothing more to
  // do in the handler itself. Keeping the wrapper so future redirect logic
  // (e.g., forcing onboarding if constraints aren't set) can live here.
  return;
});

export const config = {
  // Match all paths except Next.js internals and static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
