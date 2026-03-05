import { query, type McpServerConfig as SdkMcpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import type { AgentRunner, AgentEvent, RunTurnOptions } from "../types.ts";
import type { AgentRunnerConfig } from "./agent-runner.ts";
import { logger } from "../observability/logger.ts";

export class ClaudeRunner implements AgentRunner {
  constructor(private config: AgentRunnerConfig) {}

  async *run(options: RunTurnOptions): AsyncIterable<AgentEvent> {
    const { prompt, workspaceDir, sessionId, abortController, mcpServers } = options;

    const stderrLines: string[] = [];

    const stream = query({
      prompt,
      options: {
        model: this.config.model,
        cwd: workspaceDir,
        ...(sessionId ? { resume: sessionId } : {}),
        abortController,
        permissionMode: this.config.permissionMode,
        ...(this.config.permissionMode === "bypassPermissions"
          ? { allowDangerouslySkipPermissions: true }
          : {}),
        maxTurns: 1,
        settingSources: ["user", "project", "local"],
        ...(this.config.allowedTools?.length
          ? { allowedTools: this.config.allowedTools }
          : {}),
        ...(mcpServers && Object.keys(mcpServers).length > 0
          ? { mcpServers: mcpServers as Record<string, SdkMcpServerConfig> }
          : {}),
        ...(this.config.apiKey
          ? { env: { ...process.env, ANTHROPIC_API_KEY: this.config.apiKey } }
          : {}),
        stderr: (data: string) => {
          const line = data.trim();
          if (line) stderrLines.push(line);
          logger.debug("claude stderr", { data: line });
        },
      },
    });

    try {
      for await (const msg of stream) {
        if (msg.type === "system" && msg.subtype === "init" && "session_id" in msg) {
          yield { type: "session_id", sessionId: msg.session_id as string };
        }

        if ("usage" in msg && msg.usage) {
          const u = msg.usage as {
            input_tokens?: number;
            output_tokens?: number;
            cache_read_input_tokens?: number;
            cache_creation_input_tokens?: number;
          };
          yield {
            type: "usage",
            inputTokens: u.input_tokens ?? 0,
            outputTokens: u.output_tokens ?? 0,
            cacheReadTokens: u.cache_read_input_tokens ?? 0,
            cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
          };
        }

        if (msg.type === "assistant" && "message" in msg && msg.message?.content) {
          for (const block of msg.message.content as Array<{ type: string; text?: string; name?: string; input?: unknown }>) {
            if (block.type === "text" && block.text) {
              yield { type: "text", content: block.text };
            } else if (block.type === "tool_use" && block.name) {
              yield { type: "tool_use", toolName: block.name, toolInput: block.input };
            }
          }
        }

        if (msg.type === "result") {
          yield { type: "done" };
          return;
        }
      }
    } catch (err: unknown) {
      const error = err as Error;
      if (error.name === "AbortError" || abortController.signal.aborted) {
        return;
      }

      const stderrOutput = stderrLines.join("\n").toLowerCase();
      const authPatterns = ["login", "auth", "token", "unauthenticated", "unauthorized", "credentials", "sign in"];
      const isAuthFailure = authPatterns.some(p => stderrOutput.includes(p));
      const isTrimCrash = error.message?.includes(".trim") || error.message?.includes("undefined is not an object");

      if (isAuthFailure) {
        const msg = `Authentication failed. Run 'claude login' first or set ANTHROPIC_API_KEY. CLI stderr: ${stderrLines.slice(-3).join(" | ")}`;
        logger.error("auth failure detected", { stderr: stderrLines.slice(-3).join(" | ") });
        yield { type: "error", error: msg };
      } else {
        const msg = isTrimCrash && stderrLines.length > 0
          ? `CLI process failed on startup. stderr: ${stderrLines.slice(-5).join(" | ")}`
          : error.message;
        logger.error("claude runner error", { error: msg });
        yield { type: "error", error: msg };
      }
    }

    yield { type: "done" };
  }
}
