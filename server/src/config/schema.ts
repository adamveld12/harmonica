import { z } from "zod";
import { TrackerSchema as _TrackerSchema, SensorsFileSchema as _SensorsFileSchema } from "@harmonica/sensor-core";
export type { TrackerConfig, SensorsFileConfig } from "@harmonica/sensor-core";

export { _TrackerSchema as TrackerSchema, _SensorsFileSchema as SensorsFileSchema };

export const AgentSchema = z
  .object({
    model: z.string().default("claude-sonnet-4-20250514"),
    max_turns: z.number().default(50),
    turn_timeout_s: z.number().default(600),
    max_retry_backoff_s: z.number().default(300),
    max_concurrency: z.number().default(3),
    permission_mode: z.enum(["bypassPermissions", "default", "acceptEdits"]).default("bypassPermissions"),
    allowed_tools: z.array(z.string()).optional(),
    auth_method: z.enum(["api_key", "subscription"]).default("subscription"),
    api_key: z.string().optional(),
  })
  .default({
    model: "claude-sonnet-4-20250514",
    max_turns: 50,
    turn_timeout_s: 600,
    max_retry_backoff_s: 300,
    max_concurrency: 3,
    permission_mode: "bypassPermissions",
    auth_method: "subscription",
  });

export const WorkspaceSchema = z
  .object({
    repo_url: z.string().optional(),
    cleanup_on_start: z.boolean().default(true),
    cleanup_on_terminal: z.boolean().default(true),
  })
  .default({
    cleanup_on_start: true,
    cleanup_on_terminal: true,
  });

export const HooksSchema = z
  .object({
    after_create: z.string().optional(),
    before_run: z.string().optional(),
    after_run: z.string().optional(),
    before_remove: z.string().optional(),
    timeout_s: z.number().default(60),
  })
  .default({
    timeout_s: 60,
  });

export const PolicySchema = z
  .object({
    max_concurrency: z.number().optional(),
    allow_multiple_per_issue: z.boolean().default(false),
  })
  .default({
    allow_multiple_per_issue: false,
  });

export const ConfigSchema = z.object({
  poll_interval_s: z.number().default(30),
  stall_timeout_s: z.number().default(300),
  tracker: _TrackerSchema,
  agent: AgentSchema,
  workspace: WorkspaceSchema,
  hooks: HooksSchema,
  policy: PolicySchema,
});

export type Config = z.infer<typeof ConfigSchema>;
export type HooksConfig = z.infer<typeof HooksSchema>;

export function getEffectiveConcurrency(config: Config): number {
  return config.policy.max_concurrency ?? config.agent.max_concurrency;
}
