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
  });
}
