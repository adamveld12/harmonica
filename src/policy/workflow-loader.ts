import { readFile } from "fs/promises";
import { parse } from "yaml";
import type { WorkflowConfig } from "../types.ts";

export async function loadWorkflow(filePath: string): Promise<WorkflowConfig> {
  const raw = await readFile(filePath, "utf-8");

  let frontmatter: Record<string, unknown> = {};
  let body: string;

  if (raw.startsWith("---\n") || raw.startsWith("---\r\n")) {
    const end = raw.indexOf("\n---", 4);
    if (end !== -1) {
      const fmContent = raw.slice(4, end);
      frontmatter = (parse(fmContent) as Record<string, unknown>) ?? {};
      const afterDelimiter = raw.indexOf("\n", end + 1);
      body = afterDelimiter !== -1 ? raw.slice(afterDelimiter + 1) : "";
    } else {
      body = raw;
    }
  } else {
    body = raw;
  }

  return {
    raw,
    frontmatter,
    promptTemplate: body.trim(),
    loadedAt: Date.now(),
    name: typeof frontmatter["name"] === "string" ? frontmatter["name"] : undefined,
    description: typeof frontmatter["description"] === "string" ? frontmatter["description"] : undefined,
  };
}
