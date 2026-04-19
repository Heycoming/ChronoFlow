/**
 * Module augmentation so TypeScript knows about the extra fields we
 * attach to the session in `src/auth.ts` (Google tokens + user id).
 */
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    refreshToken?: string;
    /** UNIX seconds — Google's `expires_at`. */
    accessTokenExpiresAt?: number;
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
