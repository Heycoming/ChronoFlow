/**
 * Zod schemas for Gemini schedule-generation output.
 *
 * CONTRACT: Gemini output is untrusted. It is always validated against these
 * schemas before any DB write. On schema failure, we retry once with the
 * error appended to the prompt; on second failure, surface to the user.
 * Never silently coerce.
 */
import { z } from "zod";

// Gemini sometimes omits timezone offsets. Accept any string that Date.parse
// understands, which covers "2026-04-18T09:00:00", "...Z", and "...-04:00".
const dateTimeString = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid datetime string");

export const PlannedBlockSchema = z.object({
  // Either ties the block to a user-requested Task, or marks it as a buffer/meta block.
  taskId: z.string().nullable(),
  start: dateTimeString,
  end: dateTimeString,
  title: z.string().min(1).max(200),
  energyType: z.enum(["HIGH", "LOW", "CREATIVE", "ADMIN"]),
  isBuffer: z.boolean().default(false),
  rationale: z.string().max(280).optional(),
});

export const ScheduleOutputSchema = z.object({
  blocks: z.array(PlannedBlockSchema).min(0),
  /** One-paragraph summary the AI can give the user describing its choices. */
  summary: z.string().max(500).optional(),
});

export type PlannedBlock = z.infer<typeof PlannedBlockSchema>;
export type ScheduleOutput = z.infer<typeof ScheduleOutputSchema>;

/**
 * JSON Schema (Draft-07 subset) derived from the Zod schema above. Passed
 * to Gemini via config.responseJsonSchema so the model is constrained at
 * decode time. We keep a hand-authored version (instead of z.toJSONSchema)
 * because Gemini's accepted JSON Schema dialect is narrower than Zod's
 * emitter produces (no `anyOf` tricks, no `nullable` unions).
 */
export const GEMINI_RESPONSE_JSON_SCHEMA = {
  type: "object",
  required: ["blocks"],
  properties: {
    blocks: {
      type: "array",
      items: {
        type: "object",
        required: ["taskId", "start", "end", "title", "energyType", "isBuffer"],
        properties: {
          taskId: { type: "string", nullable: true },
          start: { type: "string", format: "date-time" },
          end: { type: "string", format: "date-time" },
          title: { type: "string" },
          energyType: {
            type: "string",
            enum: ["HIGH", "LOW", "CREATIVE", "ADMIN"],
          },
          isBuffer: { type: "boolean" },
          rationale: { type: "string" },
        },
      },
    },
    summary: { type: "string" },
  },
} as const;
