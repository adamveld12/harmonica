import { z } from "zod";

const SensorSchema = z.object({
  type: z.literal("linear"),
  api_key: z.string(),
  mode: z.enum(["issues", "projects"]).default("issues"),
  poll_interval_ms: z.number().default(30000),
  refresh_ttl_ms: z.number().default(5000),
  active_states: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
});

export const SensorsFileSchema = z.record(z.string(), SensorSchema);

export type SensorConfig = z.infer<typeof SensorSchema>;
export type SensorsFileConfig = z.infer<typeof SensorsFileSchema>;

export const TrackerSchema = z
  .object({
    type: z.literal("linear"),
    sensor: z.string(),
    filter_labels: z.array(z.string()).optional(),
    filter_states: z.array(z.string()).optional(),
    filter_project: z.string().optional(),
    filter_assignees: z.array(z.string()).optional(),
    project_id: z.string().optional(),
    project_name: z.string().optional(),
    // Populated at runtime from sensor, not provided in workflow frontmatter
    api_key: z.string().optional(),
    mode: z.enum(["issues", "projects"]).optional(),
    active_states: z.array(z.string()).optional(),
    terminal_states: z.array(z.string()).optional(),
  });

export const AgentSchema = z
  .object({
    model: z.string().default("claude-sonnet-4-20250514"),
    max_turns: z.number().default(50),
    turn_timeout_ms: z.number().default(120_000),
    max_retry_backoff_ms: z.number().default(300_000),
    max_concurrency: z.number().default(3),
    permission_mode: z
      .enum(["bypassPermissions", "default", "acceptEdits"])
      .default("bypassPermissions"),
    allowed_tools: z.array(z.string()).optional(),
    auth_method: z.enum(["api_key", "subscription"]).default("subscription"),
    api_key: z.string().optional(),
  })
  .default({});

export const WorkspaceSchema = z
  .object({
    repo_url: z.string().optional(),
    cleanup_on_start: z.boolean().default(true),
    cleanup_on_terminal: z.boolean().default(true),
  })
  .default({});

export const HooksSchema = z
  .object({
    after_create: z.string().optional(),
    before_run: z.string().optional(),
    after_run: z.string().optional(),
    before_remove: z.string().optional(),
    timeout_ms: z.number().default(60_000),
  })
  .default({});

export const PolicySchema = z
  .object({
    max_concurrency: z.number().optional(),
    allow_multiple_per_issue: z.boolean().default(false),
  })
  .default({});

export const ConfigSchema = z.object({
  poll_interval_ms: z.number().default(30_000),
  stall_timeout_ms: z.number().default(300_000),
  tracker: TrackerSchema,
  agent: AgentSchema,
  workspace: WorkspaceSchema,
  hooks: HooksSchema,
  policy: PolicySchema,
});

export type Config = z.infer<typeof ConfigSchema>;
export type TrackerConfig = z.infer<typeof TrackerSchema>;
export type HooksConfig = z.infer<typeof HooksSchema>;

export function getEffectiveConcurrency(config: Config): number {
  return config.policy.max_concurrency ?? config.agent.max_concurrency;
}
