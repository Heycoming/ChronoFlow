"use server";

/**
 * Server actions for the onboarding/constraints flow. Persist Constraint rows
 * owned by the authenticated user. The `schedule` Json field is a
 * WeeklyRecurrence (daysOfWeek + startMinuteOfDay + endMinuteOfDay).
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

const weeklyScheduleSchema = z.object({
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
  startMinuteOfDay: z.number().int().min(0).max(1440),
  endMinuteOfDay: z.number().int().min(0).max(1440),
});

const constraintTypeSchema = z.enum(["SLEEP", "MEAL", "HYGIENE", "CUSTOM"]);

const saveConstraintSchema = z.object({
  type: constraintTypeSchema,
  label: z.string().trim().min(1).max(100),
  schedule: weeklyScheduleSchema,
  energyCost: z.number().int().min(0).max(10).optional(),
});

export type SaveConstraintInput = z.infer<typeof saveConstraintSchema>;

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  return session.user.id;
}

export async function addConstraint(input: SaveConstraintInput): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const parsed = saveConstraintSchema.parse(input);
    await prisma.constraint.create({
      data: {
        userId,
        type: parsed.type,
        label: parsed.label,
        schedule: parsed.schedule as Prisma.InputJsonValue,
        energyCost: parsed.energyCost ?? 0,
      },
    });
    revalidatePath("/onboarding");
    revalidatePath("/tasks");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function deleteConstraint(id: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    // Scope deletion to the user so IDs can't be used to delete others' rows.
    await prisma.constraint.deleteMany({ where: { id, userId } });
    revalidatePath("/onboarding");
    revalidatePath("/tasks");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues.map((i) => i.message).join(", ");
  if (err instanceof Error) return err.message;
  return "Unknown error";
}
