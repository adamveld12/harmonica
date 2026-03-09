import { z } from "zod";

export const GitHubSensorSchema = z.object({
  type: z.literal("github"),
  token: z.string().optional(),
  owner: z.string(),
  repo: z.string(),
  mode: z.enum(["issues", "pull_requests", "projects"]).default("issues"),
  project: z.string().optional(),
  poll_interval_s: z.number().default(30),
  refresh_ttl_s: z.number().default(5),
  active_states: z.array(z.string()).optional(),
});

export type GitHubSensorConfig = z.infer<typeof GitHubSensorSchema>;
