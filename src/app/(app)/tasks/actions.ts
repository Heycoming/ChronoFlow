"use server";

/**
 * Server actions for the Task pool. Creating/deleting a task triggers a
 * revalidation of both /tasks (list + Reality Check) and /calendar (because
 * the Reality Check pane on the calendar mirrors the task pool).
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

const prioritySchema = z.enum(["P0", "P1", "P2", "P3"]);
const timeOfDaySchema = z.enum(["ANY", "MORNING", "AFTERNOON", "EVENING", "NIGHT"]);
const energyTypeSchema = z.enum(["HIGH", "LOW", "CREATIVE", "ADMIN"]);

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  estimatedMinutes: z.number().int().min(5).max(60 * 12), // 5 min .. 12 hours
  priority: prioritySchema,
  preferredTimeOfDay: timeOfDaySchema,
  preferredDaysOfWeek: z
    .array(z.number().int().min(0).max(6))
    .max(7)
    .optional()
    .default([]),
  energyType: energyTypeSchema,
  deadline: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? new Date(v) : null)),
  notes: z.string().trim().max(500).optional(),
});

export type CreateTaskInput = z.input<typeof createTaskSchema>;

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  return session.user.id;
}

export async function createTask(input: CreateTaskInput): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const parsed = createTaskSchema.parse(input);
    if (parsed.deadline && Number.isNaN(parsed.deadline.getTime())) {
      return { ok: false, error: "Invalid deadline." };
    }
    // De-dupe and sort the day-of-week array for a canonical stored form.
    const dedupedDays = Array.from(new Set(parsed.preferredDaysOfWeek)).sort(
      (a, b) => a - b,
    );
    await prisma.task.create({
      data: {
        userId,
        title: parsed.title,
        estimatedMinutes: parsed.estimatedMinutes,
        priority: parsed.priority,
        preferredTimeOfDay: parsed.preferredTimeOfDay,
        preferredDaysOfWeek: dedupedDays,
        energyType: parsed.energyType,
        deadline: parsed.deadline,
        notes: parsed.notes,
      },
    });
    revalidatePath("/tasks");
    revalidatePath("/calendar");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function deleteTask(id: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await prisma.task.deleteMany({ where: { id, userId } });
    revalidatePath("/tasks");
    revalidatePath("/calendar");
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
