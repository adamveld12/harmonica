import type { SensorBackend } from "@harmonica/sensor-core";
import type { LinearIssueNode, LinearProjectListNode, LinearProjectNode } from "./types.ts";
import { fetchAllIssueNodes, fetchAllProjectNodes, fetchOneIssueNode, fetchOneProjectNode } from "./api.ts";

export function createLinearIssuesBackend(apiKey: string, activeStates: string[]): SensorBackend<LinearIssueNode> {
  return {
    async fetchAll() {
      return fetchAllIssueNodes(apiKey, activeStates);
    },
    async fetchOne(id) {
      return fetchOneIssueNode(apiKey, id);
    },
  };
}

export function createLinearProjectsBackend(
  apiKey: string,
  activeStates: string[],
): SensorBackend<LinearProjectListNode, LinearProjectNode> {
  return {
    async fetchAll() {
      return fetchAllProjectNodes(apiKey, activeStates);
    },
    async fetchOne(id) {
      return fetchOneProjectNode(apiKey, id);
    },
  };
}
