/**
 * Auth.js HTTP endpoints (/api/auth/*). Auth.js v5 bundles GET+POST into
 * `handlers`; re-export them at the well-known path so Next.js' App Router
 * serves the Google OAuth redirect_uri (`/api/auth/callback/google`).
 */
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
