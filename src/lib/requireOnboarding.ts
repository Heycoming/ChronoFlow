import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

/**
 * Redirect to /onboarding if the user has no constraints set up.
 * Call this from any server page that requires onboarding to be complete.
 */
export async function requireOnboarding(userId: string): Promise<void> {
  const count = await prisma.constraint.count({ where: { userId } });
  if (count === 0) redirect("/onboarding");
}
