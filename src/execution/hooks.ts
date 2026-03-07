import { Liquid } from "liquidjs";
import type { HookName, HookContext } from "../types.ts";
import type { HooksConfig } from "../config/schema.ts";
import { logger } from "../observability/logger.ts";

const engine = new Liquid({ strictVariables: false, strictFilters: false });

async function runHook(hookCommand: string, ctx: HookContext, timeoutMs: number): Promise<void> {
  const templateVars: Record<string, unknown> = {
    workspace_dir: ctx.workspaceDir,
    attempt: ctx.attempt,
    repo_url: ctx.repoUrl ?? "",
  };

  if (ctx.workItem) {
    templateVars.item = ctx.workItem;
    templateVars.issue = ctx.workItem.kind === "issue" ? ctx.workItem : null;
    templateVars.project = ctx.workItem.kind === "project" ? ctx.workItem : null;
  }

  if (hookCommand.includes("repo_url") && !ctx.repoUrl) {
    logger.warn("hook references repo_url but it is not set", {
      hook: hookCommand.slice(0, 60),
    });
  }

  const rendered = await engine.parseAndRender(hookCommand, templateVars);

  logger.debug("running hook", { command: rendered.slice(0, 80), workspace: ctx.workspaceDir });

  const env = {
    ...process.env,
    HARM_ISSUE_ID: ctx.issueId,
    HARM_ISSUE_IDENTIFIER: ctx.issueIdentifier,
    HARM_WORKSPACE_DIR: ctx.workspaceDir,
    HARM_SESSION_ID: ctx.sessionId ?? "",
  };

  const proc = Bun.spawn(["sh", "-c", rendered], {
    cwd: ctx.workspaceDir,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => {
      proc.kill();
      reject(new Error(`Hook timed out after ${timeoutMs}ms`));
    }, timeoutMs),
  );

  const completion = proc.exited.then(async (exitCode) => {
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`Hook exited with code ${exitCode}${stderr ? `: ${stderr.trim()}` : ""}`);
    }
  });

  await Promise.race([completion, timeout]);
}

export async function runHooks(hookName: HookName, hooksConfig: HooksConfig, ctx: HookContext): Promise<void> {
  const command = hooksConfig[hookName];
  if (!command) return;

  logger.info(`running ${hookName} hook`, { issue_id: ctx.issueId });
  await runHook(command, ctx, hooksConfig.timeout_ms);
  logger.info(`${hookName} hook completed`, { issue_id: ctx.issueId });
}
