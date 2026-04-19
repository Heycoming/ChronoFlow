/**
 * Onboarding / constraints setup. Loads the user's existing Constraint rows
 * server-side so the wizard can show them for review & deletion.
 */
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  OnboardingWizard,
  type ExistingConstraint,
} from "@/components/OnboardingWizard";
import type { WeeklyRecurrence } from "@/types/schedule";

export default async function OnboardingPage() {
  const session = await auth();
  const userId = session?.user?.id;

  const rows = userId
    ? await prisma.constraint.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const initial: ExistingConstraint[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    label: r.label,
    // Json comes back as `unknown` from Prisma; we validate shape on write,
    // so trust it here and narrow for the client component.
    schedule: r.schedule as unknown as WeeklyRecurrence,
  }));

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Constraints</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Tell ChronoFlow when you sleep, eat, and take care of yourself. The AI
          will treat these windows as immovable when it builds your schedule.
        </p>
      </header>
      <OnboardingWizard initial={initial} />
    </div>
  );
}
