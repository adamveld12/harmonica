import type { AgentRunner } from "../types.ts";
import { ClaudeRunner } from "./claude-runner.ts";

export type { AgentRunner, RunTurnOptions } from "../types.ts";

export interface AgentRunnerConfig {
  model: string;
  permissionMode: "bypassPermissions" | "default" | "acceptEdits";
  allowedTools?: string[];
  authMethod: "api_key" | "subscription";
  apiKey?: string;
}

export function createAgentRunner(config: AgentRunnerConfig): AgentRunner {
  return new ClaudeRunner(config);
}
