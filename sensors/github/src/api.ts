import { logger } from "@harmonica/sensor-core";
import type { GitHubIssueNode, GitHubPRNode, GitHubProjectItemNode } from "./types.ts";

// ---------------------------------------------------------------------------
// Core gh CLI wrappers
// ---------------------------------------------------------------------------

async function spawnGh(args: string[], token?: string, stdin?: Blob): Promise<string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  if (token) env.GH_TOKEN = token;

  const proc = Bun.spawn(["gh", ...args], {
    env,
    stdin,
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
 * Execute a GraphQL query via `gh api graphql --input -` (reads JSON from stdin).
 * Returns the `data` field of the response, or throws on errors.
 */
export async function ghApiGraphQL<T>(query: string, variables: Record<string, unknown>, token?: string): Promise<T> {
  const payload = JSON.stringify({ query, variables });
  const output = await spawnGh(["api", "graphql", "--input", "-"], token, new Blob([payload]));
  const response = JSON.parse(output) as { data: T; errors?: Array<{ message: string }> };
  if (response.errors?.length) {
    throw new Error(`GraphQL errors: ${response.errors.map((e) => e.message).join(", ")}`);
  }
  return response.data;
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

// GraphQL query to fetch project item assignees for both org and user owners.
const PROJECT_ITEM_ASSIGNEES_QUERY = `
  query GetProjectItemAssignees($owner: String!, $number: Int!, $cursor: String) {
    repositoryOwner(login: $owner) {
      ... on Organization {
        projectV2(number: $number) { ...ProjectItems }
      }
      ... on User {
        projectV2(number: $number) { ...ProjectItems }
      }
    }
  }
  fragment ProjectItems on ProjectV2 {
    items(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        content {
          ... on Issue { assignees(first: 10) { nodes { login } } }
          ... on PullRequest { assignees(first: 10) { nodes { login } } }
        }
      }
    }
  }
`;

interface ProjectItemAssigneesResponse {
  repositoryOwner: {
    projectV2?: {
      items: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Array<{
          id: string;
          content: { assignees?: { nodes: Array<{ login: string }> } } | null;
        }>;
      };
    } | null;
  } | null;
}

/**
 * Fetch a map of project item ID → assignee logins via GraphQL.
 * Handles pagination. Gracefully returns an empty map on error so that
 * `fetchProjectItems` can still return items without assignee data.
 */
async function fetchProjectItemAssignees(
  owner: string,
  projectNumber: number,
  token?: string,
): Promise<Map<string, Array<{ login: string }>>> {
  const result = new Map<string, Array<{ login: string }>>();
  let cursor: string | null = null;
  const MAX_PAGES = 50;
  let page = 0;

  try {
    do {
      if (++page > MAX_PAGES) {
        logger.warn("github project item assignees pagination limit reached", { owner, projectNumber, MAX_PAGES });
        break;
      }

      const data: ProjectItemAssigneesResponse = await ghApiGraphQL<ProjectItemAssigneesResponse>(
        PROJECT_ITEM_ASSIGNEES_QUERY,
        { owner, number: projectNumber, cursor },
        token,
      );

      const items = data.repositoryOwner?.projectV2?.items;
      if (!items) break;

      for (const node of items.nodes) {
        result.set(node.id, node.content?.assignees?.nodes ?? []);
      }

      cursor = items.pageInfo.hasNextPage ? items.pageInfo.endCursor : null;
    } while (cursor !== null);
  } catch (err) {
    logger.warn("github fetch project item assignees failed, continuing without assignee data", {
      owner,
      projectNumber,
      error: String(err),
    });
  }

  return result;
}

export async function fetchProjectItems(
  owner: string,
  projectNumber: number,
  token?: string,
  resolveAssignees = false,
): Promise<GitHubProjectItemNode[]> {
  logger.debug("github fetch project items", { owner, projectNumber, resolveAssignees });
  try {
    const output = await spawnGh(
      ["project", "item-list", String(projectNumber), "--owner", owner, "--format", "json"],
      token,
    );
    const data = JSON.parse(output) as GhProjectItemsOutput;

    // Only fetch assignees via GraphQL when filtering by assignee is needed
    const assigneeMap = resolveAssignees
      ? await fetchProjectItemAssignees(owner, projectNumber, token)
      : new Map<string, Array<{ login: string }>>();

    const items: GitHubProjectItemNode[] = data.items.map((item) => ({
      id: item.id,
      title: item.title,
      body: item.body,
      status: item.status,
      url: item.url,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
      assignees: assigneeMap.get(item.id) ?? [],
    }));
    logger.info("github project items fetched", { owner, projectNumber, total: items.length });
    return items;
  } catch (err) {
    logger.warn("github fetch project items failed", { owner, projectNumber, error: String(err) });
    return [];
  }
}
