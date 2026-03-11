import { Liquid } from "liquidjs";
import type { PromptVariables } from "../types.ts";

const engine = new Liquid({ strictVariables: false, strictFilters: true });

export async function renderPrompt(template: string, vars: PromptVariables): Promise<string> {
  return engine.parseAndRender(template, {
    issue: vars.issue,
    project: vars.project,
    item: vars.item,
    attempt: vars.attempt,
    workspace_dir: vars.workspace_dir,
    repo_name: vars.repo_name ?? null,
    repo_url: vars.repo_url ?? null,
    repo_default_branch: vars.repo_default_branch ?? null,
    branch_name: vars.branch_name ?? null,
  });
}
