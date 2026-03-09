import type { Sensor } from "@harmonica/sensor-core";
import { PollingSensor } from "@harmonica/sensor-core";
import type { LinearSensorConfig } from "./schema.ts";
import { createLinearIssuesBackend, createLinearProjectsBackend } from "./backend.ts";
import { linearIssuesPipeline, linearProjectsPipeline } from "./pipeline.ts";

const DEFAULT_ACTIVE_STATES_ISSUES = ["Backlog", "Ready"];
const DEFAULT_ACTIVE_STATES_PROJECTS = ["started"];

export function createLinearSensor(config: LinearSensorConfig): Sensor {
  const activeStates = config.active_states?.length
    ? config.active_states
    : config.mode === "projects"
      ? DEFAULT_ACTIVE_STATES_PROJECTS
      : DEFAULT_ACTIVE_STATES_ISSUES;

  if (config.mode === "projects") {
    const backend = createLinearProjectsBackend(config.api_key, activeStates);
    return new PollingSensor(config, backend, linearProjectsPipeline);
  }

  const backend = createLinearIssuesBackend(config.api_key, activeStates);
  return new PollingSensor(config, backend, linearIssuesPipeline);
}
