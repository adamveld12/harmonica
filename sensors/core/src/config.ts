import { z } from "zod";

/**
 * Phase 1 (loose) validation: validates common fields only, passes through
 * sensor-specific fields (api_key, owner, repo, etc.) for phase 2 validation
 * by the sensor's own schema.
 */
export const SensorConfigLoose = z
  .object({
    type: z.string(),
    poll_interval_s: z.number().default(30),
    refresh_ttl_s: z.number().default(5),
    active_states: z.array(z.string()).optional(),
  })
  .passthrough();

export const SensorsFileSchema = z.record(z.string(), SensorConfigLoose);

export type SensorsFileConfig = z.infer<typeof SensorsFileSchema>;
export type SensorConfigLooseType = z.infer<typeof SensorConfigLoose>;

export const TrackerSchema = z.object({
  type: z.enum(["linear", "github"]).default("linear"),
  sensor: z.string(),
  filter_labels: z.array(z.string()).optional(),
  filter_states: z.array(z.string()).optional(),
  filter_project: z.string().optional(),
  filter_assignees: z.array(z.string()).optional(),
  // GitHub-specific filters
  filter_milestone: z.string().optional(),
  filter_base_branch: z.string().optional(),
  filter_draft: z.boolean().optional(),
  // projects mode
  project_id: z.string().optional(),
  project_name: z.string().optional(),
  // Populated at runtime from sensor, not provided in workflow frontmatter
  api_key: z.string().optional(),
  mode: z.enum(["issues", "projects", "pull_requests"]).optional(),
  active_states: z.array(z.string()).optional(),
  terminal_states: z.array(z.string()).optional(),
});

export type TrackerConfig = z.infer<typeof TrackerSchema>;
