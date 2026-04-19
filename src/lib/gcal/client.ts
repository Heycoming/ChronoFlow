/**
 * Authenticated Google API client, keyed by userId.
 *
 * Wraps `googleapis`' OAuth2Client and arms it with the refresh_token we
 * captured during Auth.js sign-in (stored on the Account row). When Google
 * returns a refreshed access_token, the `tokens` event fires and we
 * persist it back to the DB so subsequent requests stay authenticated.
 *
 * Consumers (e.g., src/lib/gcal/sync.ts) just call `getGoogleClient(userId)`
 * and use the returned `calendar` namespace.
 */
import { google, calendar_v3 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { prisma } from "@/lib/db";

export interface GoogleApiContext {
  oauth2: OAuth2Client;
  calendar: calendar_v3.Calendar;
}

export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

export async function getGoogleClient(userId: string): Promise<GoogleApiContext> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });
  if (!account) {
    throw new GoogleAuthError("No Google account linked to this user.");
  }
  if (!account.refresh_token) {
    throw new GoogleAuthError(
      "Google account missing refresh_token — user must re-authenticate.",
    );
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  oauth2.setCredentials({
    access_token: account.access_token ?? undefined,
    refresh_token: account.refresh_token,
    // googleapis expects expiry_date in milliseconds; account.expires_at is UNIX seconds.
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  // Google only returns `refresh_token` on the first consent; on routine
  // refresh we only get a new access_token. Preserve the old refresh_token
  // unless Google explicitly sends a new one.
  oauth2.on("tokens", async (tokens) => {
    try {
      await prisma.account.update({
        where: { id: account.id },
        data: {
          ...(tokens.access_token ? { access_token: tokens.access_token } : {}),
          ...(tokens.expiry_date
            ? { expires_at: Math.floor(tokens.expiry_date / 1000) }
            : {}),
          ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
        },
      });
    } catch (err) {
      // Don't throw — the live call already has a valid token in memory.
      // Log so we notice if a refresh persist starts failing in prod.
      console.error("[gcal] Failed to persist refreshed tokens", err);
    }
  });

  return {
    oauth2,
    calendar: google.calendar({ version: "v3", auth: oauth2 }),
  };
}
