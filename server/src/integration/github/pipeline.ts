import type { SensorPipeline } from "../sensor/types.ts";
import type { GitHubIssueNode, GitHubPRNode, GitHubProjectItemNode } from "./types.ts";
import {
  normalizeGitHubIssue,
  normalizeGitHubPR,
  normalizeGitHubProjectItem,
  matchesGitHubIssueFilters,
  matchesGitHubPRFilters,
  matchesGitHubProjectItemFilters,
} from "./types.ts";
import type { TrackerConfig } from "../../config/schema.ts";
import type { StateClassificationConfig } from "../sensor/types.ts";
import type { WorkItem } from "../../types.ts";

// Owner and repo are captured by each factory function below.

export function createGitHubIssuesPipeline(owner: string, repo: string): SensorPipeline<GitHubIssueNode> {
  return {
    filter: (node, config) => matchesGitHubIssueFilters(node, config),
    normalizeList: (node, stateConfig) => normalizeGitHubIssue(node, owner, repo, stateConfig),
    normalizeDetail: (node, stateConfig) => normalizeGitHubIssue(node, owner, repo, stateConfig),
  };
}

export function createGitHubPRsPipeline(owner: string, repo: string): SensorPipeline<GitHubPRNode> {
  return {
    filter: (node, config) => matchesGitHubPRFilters(node, config),
    normalizeList: (node, stateConfig) => normalizeGitHubPR(node, owner, repo, stateConfig),
    normalizeDetail: (node, stateConfig) => normalizeGitHubPR(node, owner, repo, stateConfig),
  };
}

export function createGitHubProjectsPipeline(owner: string): SensorPipeline<GitHubProjectItemNode> {
  return {
    filter: (node, config) => matchesGitHubProjectItemFilters(node, config),
    normalizeList: (node, stateConfig) => normalizeGitHubProjectItem(node, owner, stateConfig),
    normalizeDetail: (node, stateConfig) => normalizeGitHubProjectItem(node, owner, stateConfig),
  };
}
