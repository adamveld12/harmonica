import { Liquid } from "liquidjs";
import type { HookName, HookContext } from "../types.ts";
import type { HooksConfig } from "../config/schema.ts";
import { logger } from "../observability/logger.ts";

const engine = new Liquid({ strictVariables: false, strictFilters: false });

export async function runHook(
  hookCommand: string,
  ctx: HookContext,
  timeoutMs: number
): Promise<void> {
  const rendered = await engine.parseAndRender(hookCommand, {
    workspace_dir: ctx.workspaceDir,
    issue_id: ctx.issueId,
    issue_identifier: ctx.issueIdentifier,
    session_id: ctx.sessionId ?? "",
    repo_url: ctx.repoUrl ?? "",
  });

  logger.debug("running hook", { command: rendered.slice(0, 80), workspace: ctx.workspaceDir });

  const env = {
    ...process.env,
    HARM_ISSUE_ID: ctx.issueId,
    HARM_ISSUE_IDENTIFIER: ctx.issueIdentifier,
    HARM_WORKSPACE_DIR: ctx.workspaceDir,
    HARM_SESSION_ID: ctx.sessionId ?? "",
    HARM_REPO_URL: ctx.repoUrl ?? process.env.HARM_REPO_URL ?? "",
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
    }, timeoutMs)
  );

  const completion = proc.exited.then(exitCode => {
    if (exitCode !== 0) {
      throw new Error(`Hook exited with code ${exitCode}`);
    }
  });

  await Promise.race([completion, timeout]);
}

export async function runHooks(
  hookName: HookName,
  hooksConfig: HooksConfig,
  ctx: HookContext
): Promise<void> {
  const command = hooksConfig[hookName];
  if (!command) return;

  logger.info(`running ${hookName} hook`, { issue_id: ctx.issueId });
  await runHook(command, ctx, hooksConfig.timeout_ms);
  logger.info(`${hookName} hook completed`, { issue_id: ctx.issueId });
}
