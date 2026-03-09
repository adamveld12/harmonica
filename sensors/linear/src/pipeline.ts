import type { SensorPipeline } from "@harmonica/sensor-core";
import type { LinearIssueNode, LinearProjectListNode, LinearProjectNode } from "./types.ts";
import { normalizeIssue, normalizeProjectListItem, normalizeProject } from "./types.ts";
import { matchesIssueFilters, matchesProjectFilters } from "./api.ts";

export const linearIssuesPipeline: SensorPipeline<LinearIssueNode> = {
  filter: matchesIssueFilters,
  normalizeList: normalizeIssue,
  normalizeDetail: normalizeIssue,
};

export const linearProjectsPipeline: SensorPipeline<LinearProjectListNode, LinearProjectNode> = {
  filter: matchesProjectFilters,
  normalizeList: normalizeProjectListItem,
  normalizeDetail: normalizeProject,
};
