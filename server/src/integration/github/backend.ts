import { logger } from "../../observability/logger.ts";
import type { SensorBackend } from "../sensor/types.ts";
import type { GitHubIssueNode, GitHubPRNode, GitHubProjectItemNode } from "./types.ts";
import {
  fetchAllIssues,
  fetchOneIssue,
  fetchAllPullRequests,
  fetchOnePullRequest,
  resolveProjectNumber,
  fetchProjectItems,
} from "./api.ts";

export function createGitHubIssuesBackend(owner: string, repo: string, token?: string): SensorBackend<GitHubIssueNode> {
  return {
    async fetchAll() {
      return fetchAllIssues(owner, repo, token);
    },
    async fetchOne(id) {
      return fetchOneIssue(owner, repo, id, token);
    },
  };
}

export function createGitHubPRsBackend(owner: string, repo: string, token?: string): SensorBackend<GitHubPRNode> {
  return {
    async fetchAll() {
      return fetchAllPullRequests(owner, repo, token);
    },
    async fetchOne(id) {
      return fetchOnePullRequest(owner, repo, id, token);
    },
  };
}

export function createGitHubProjectsBackend(
  owner: string,
  projectName: string,
  token?: string,
): SensorBackend<GitHubProjectItemNode> {
  let projectNumber: number | null = null;

  return {
    async start() {
      projectNumber = await resolveProjectNumber(owner, projectName, token);
      if (projectNumber === null) {
        logger.warn("github project not found, items will be empty until resolved", { owner, projectName });
      } else {
        logger.info("github project resolved", { owner, projectName, number: projectNumber });
      }
    },
    async fetchAll() {
      if (projectNumber === null) {
        // Retry resolution on each poll
        projectNumber = await resolveProjectNumber(owner, projectName, token);
        if (projectNumber === null) return [];
      }
      return fetchProjectItems(owner, projectNumber, token);
    },
    async fetchOne(id) {
      if (projectNumber === null) return null;
      const items = await fetchProjectItems(owner, projectNumber, token);
      return items.find((item) => item.id === id) ?? null;
    },
  };
}
