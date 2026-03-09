import { logger } from "../../observability/logger.ts";
import type { GitHubIssueNode, GitHubPRNode, GitHubProjectItemNode } from "./types.ts";

// ---------------------------------------------------------------------------
// Core gh CLI wrappers
// ---------------------------------------------------------------------------

async function spawnGh(args: string[], token?: string): Promise<string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  if (token) env.GH_TOKEN = token;

  const proc = Bun.spawn(["gh", ...args], {
    env,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(`gh ${args.slice(0, 2).join(" ")} failed (${exitCode}): ${stderr.trim()}`);
  }

  return stdout;
}

/**
 * Call `gh api <path>` and return a single JSON value.
 */
export async function ghApi<T>(path: string, token?: string): Promise<T> {
  const output = await spawnGh(["api", path], token);
  return JSON.parse(output) as T;
}

/**
 * Call `gh api --paginate --jq '.[]' <path>` and return all items.
 * Each page's array is flattened into a single list.
 */
export async function ghApiPaginated<T>(path: string, token?: string, queryParams = ""): Promise<T[]> {
  const fullPath = queryParams ? `${path}?${queryParams}` : path;
  const output = await spawnGh(["api", "--paginate", "--jq", ".[]", fullPath], token);
  const lines = output.trim().split("\n").filter(Boolean);
  return lines.map((line) => JSON.parse(line)) as T[];
}

// ---------------------------------------------------------------------------
// Issue fetching
// ---------------------------------------------------------------------------

export async function fetchAllIssues(owner: string, repo: string, token?: string): Promise<GitHubIssueNode[]> {
  logger.debug("github fetch all issues", { owner, repo });
  const nodes = await ghApiPaginated<GitHubIssueNode>(
    `/repos/${owner}/${repo}/issues`,
    token,
    "state=open&per_page=100",
  );
  // The /issues endpoint returns both issues and PRs — filter out PRs
  const issues = nodes.filter((n) => !n.pull_request);
  logger.info("github issues fetched", { owner, repo, total: issues.length });
  return issues;
}

export async function fetchOneIssue(
  owner: string,
  repo: string,
  number: string,
  token?: string,
): Promise<GitHubIssueNode | null> {
  try {
    return await ghApi<GitHubIssueNode>(`/repos/${owner}/${repo}/issues/${number}`, token);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// PR fetching
// ---------------------------------------------------------------------------

export async function fetchAllPullRequests(owner: string, repo: string, token?: string): Promise<GitHubPRNode[]> {
  logger.debug("github fetch all PRs", { owner, repo });
  const nodes = await ghApiPaginated<GitHubPRNode>(`/repos/${owner}/${repo}/pulls`, token, "state=open&per_page=100");
  logger.info("github PRs fetched", { owner, repo, total: nodes.length });
  return nodes;
}

export async function fetchOnePullRequest(
  owner: string,
  repo: string,
  number: string,
  token?: string,
): Promise<GitHubPRNode | null> {
  try {
    return await ghApi<GitHubPRNode>(`/repos/${owner}/${repo}/pulls/${number}`, token);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Project fetching (GitHub Projects v2 via gh CLI)
// ---------------------------------------------------------------------------

interface GhProjectListItem {
  number: number;
  title: string;
}

interface GhProjectListOutput {
  projects: GhProjectListItem[];
}

export async function resolveProjectNumber(owner: string, projectName: string, token?: string): Promise<number | null> {
  try {
    const output = await spawnGh(["project", "list", "--owner", owner, "--format", "json"], token);
    const data = JSON.parse(output) as GhProjectListOutput;
    const match = data.projects.find((p) => p.title === projectName);
    return match?.number ?? null;
  } catch (err) {
    logger.warn("github resolve project number failed", { owner, projectName, error: String(err) });
    return null;
  }
}

interface GhProjectItemsOutput {
  items: Array<{
    id: string;
    title: string;
    body: string | null;
    status: string | null;
    url: string;
    createdAt: string;
    updatedAt: string;
  }>;
}

export async function fetchProjectItems(
  owner: string,
  projectNumber: number,
  token?: string,
): Promise<GitHubProjectItemNode[]> {
  logger.debug("github fetch project items", { owner, projectNumber });
  try {
    const output = await spawnGh(
      ["project", "item-list", String(projectNumber), "--owner", owner, "--format", "json"],
      token,
    );
    const data = JSON.parse(output) as GhProjectItemsOutput;
    const items: GitHubProjectItemNode[] = data.items.map((item) => ({
      id: item.id,
      title: item.title,
      body: item.body,
      status: item.status,
      url: item.url,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    }));
    logger.info("github project items fetched", { owner, projectNumber, total: items.length });
    return items;
  } catch (err) {
    logger.warn("github fetch project items failed", { owner, projectNumber, error: String(err) });
    return [];
  }
}
