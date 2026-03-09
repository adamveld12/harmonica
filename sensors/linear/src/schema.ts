import { z } from "zod";

export const LinearSensorSchema = z.object({
  type: z.literal("linear"),
  api_key: z.string(),
  mode: z.enum(["issues", "projects"]).default("issues"),
  poll_interval_s: z.number().default(30),
  refresh_ttl_s: z.number().default(5),
  active_states: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
});

export type LinearSensorConfig = z.infer<typeof LinearSensorSchema>;
