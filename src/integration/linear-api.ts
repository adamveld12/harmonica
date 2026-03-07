import { logger } from "../observability/logger.ts";
import {
  FETCH_ALL_ISSUES,
  FETCH_SINGLE_ISSUE,
  FETCH_ALL_PROJECTS,
  FETCH_PROJECT_BY_ID,
} from "./linear-queries.ts";
import type {
  LinearIssueNode,
  LinearProjectNode,
  LinearProjectListNode,
  LinearPageInfo,
} from "./linear-types.ts";
import type { TrackerConfig } from "../config/schema.ts";

const LINEAR_API = "https://api.linear.app/graphql";

async function linearGraphql<T>(
  apiKey: string,
  query: string,
  variables: Record<string, unknown> = {},
  operation?: string
): Promise<T> {
  logger.debug("linear graphql request", { operation: operation ?? "unknown", variables: JSON.stringify(variables) });
  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Linear API error: ${res.status} ${res.statusText}\n${body}`);
  }

  const json = (await res.json()) as { data?: T; errors?: unknown[] };
  if (json.errors) {
    throw new Error(`Linear GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data as T;
}

type IssuesPageData = { issues: { nodes: LinearIssueNode[]; pageInfo: LinearPageInfo } };
type ProjectsPageData = { projects: { nodes: LinearProjectListNode[]; pageInfo: LinearPageInfo } };

export async function fetchAllIssueNodes(
  apiKey: string,
  activeStates: string[]
): Promise<LinearIssueNode[]> {
  let after: string | null = null;
  const all: LinearIssueNode[] = [];
  let page = 0;
  const filter: Record<string, unknown> = { state: { name: { in: activeStates } } };

  while (true) {
    const data: IssuesPageData = await linearGraphql<IssuesPageData>(apiKey, FETCH_ALL_ISSUES, { after, filter }, "fetchIssues");
    logger.debug("linear issues page", { page, count: data.issues.nodes.length, hasNextPage: data.issues.pageInfo.hasNextPage });
    all.push(...data.issues.nodes);
    if (!data.issues.pageInfo.hasNextPage) break;
    after = data.issues.pageInfo.endCursor;
    page++;
  }
  logger.info("linear issues fetched", { total: all.length });
  return all;
}

export async function fetchAllProjectNodes(
  apiKey: string,
  activeStates: string[]
): Promise<LinearProjectListNode[]> {
  let after: string | null = null;
  const all: LinearProjectListNode[] = [];
  let page = 0;
  const filter: Record<string, unknown> = { status: { name: { in: activeStates } } };

  while (true) {
    const data: ProjectsPageData = await linearGraphql<ProjectsPageData>(apiKey, FETCH_ALL_PROJECTS, { after, filter }, "fetchProjects");
    logger.debug("linear projects page", { page, count: data.projects.nodes.length, hasNextPage: data.projects.pageInfo.hasNextPage });
    all.push(...data.projects.nodes);
    if (!data.projects.pageInfo.hasNextPage) break;
    after = data.projects.pageInfo.endCursor;
    page++;
  }
  logger.info("linear projects fetched", { total: all.length });
  return all;
}

export async function fetchOneIssueNode(
  apiKey: string,
  id: string
): Promise<LinearIssueNode | null> {
  const data = await linearGraphql<{ issue: LinearIssueNode | null }>(
    apiKey,
    FETCH_SINGLE_ISSUE,
    { id },
    "fetchIssue"
  );
  return data.issue;
}

export async function fetchOneProjectNode(
  apiKey: string,
  id: string
): Promise<LinearProjectNode | null> {
  const data = await linearGraphql<{ project: LinearProjectNode | null }>(
    apiKey,
    FETCH_PROJECT_BY_ID,
    { id },
    "fetchProject"
  );
  return data.project;
}

export function matchesIssueFilters(node: LinearIssueNode, config: TrackerConfig): boolean {
  const filterStates = config.filter_states;
  if (filterStates?.length && !filterStates.includes(node.state.name)) {
    logger.debug("issue filter rejected: state mismatch", {
      issue: node.identifier,
      expected: filterStates,
      actual: node.state.name,
    });
    return false;
  }
  if (config.filter_labels && config.filter_labels.length > 0) {
    const issueLabels = node.labels.nodes.map((l) => l.name);
    if (!config.filter_labels.every((fl) => issueLabels.includes(fl))) {
      logger.debug("issue filter rejected: label mismatch", {
        issue: node.identifier,
        required: config.filter_labels,
        actual: issueLabels,
      });
      return false;
    }
  }
  if (config.filter_project && node.project?.name !== config.filter_project) {
    logger.debug("issue filter rejected: project mismatch", {
      issue: node.identifier,
      expected: config.filter_project,
      actual: node.project?.name ?? null,
    });
    return false;
  }
  if (config.filter_assignees && config.filter_assignees.length > 0) {
    const name = node.assignee?.displayName;
    if (!name || !config.filter_assignees.includes(name)) {
      logger.debug("issue filter rejected: assignee mismatch", {
        issue: node.identifier,
        expected: config.filter_assignees,
        actual: name ?? null,
      });
      return false;
    }
  }
  return true;
}

export function matchesProjectFilters(node: LinearProjectListNode, config: TrackerConfig): boolean {
  if (config.project_id && node.id !== config.project_id) {
    logger.debug("project filter rejected: id mismatch", {
      project: node.name,
      expected: config.project_id,
      actual: node.id,
    });
    return false;
  }
  if (config.project_name && node.name !== config.project_name) {
    logger.debug("project filter rejected: name mismatch", {
      expected: config.project_name,
      actual: node.name,
    });
    return false;
  }
  if (config.filter_labels?.length) {
    const projectLabels = node.labels.nodes.map((l) => l.name);
    if (!config.filter_labels.every((fl) => projectLabels.includes(fl))) {
      logger.debug("project filter rejected: label mismatch", {
        project: node.name,
        required: config.filter_labels,
        actual: projectLabels,
      });
      return false;
    }
  }
  return true;
}
