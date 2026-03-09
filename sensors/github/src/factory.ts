import type { Sensor } from "@harmonica/sensor-core";
import { PollingSensor } from "@harmonica/sensor-core";
import type { GitHubSensorConfig } from "./schema.ts";
import { createGitHubIssuesBackend, createGitHubPRsBackend, createGitHubProjectsBackend } from "./backend.ts";
import { createGitHubIssuesPipeline, createGitHubPRsPipeline, createGitHubProjectsPipeline } from "./pipeline.ts";

export function createGitHubSensor(config: GitHubSensorConfig): Sensor {
  const { owner, repo, token, mode } = config;

  if (mode === "projects") {
    if (!config.project) {
      throw new Error(
        `GitHub sensor (${owner}/${repo}) in "projects" mode requires a "project" name in the sensor config.`,
      );
    }
    const backend = createGitHubProjectsBackend(owner, config.project, token);
    const pipeline = createGitHubProjectsPipeline(owner);
    return new PollingSensor(config, backend, pipeline);
  }

  if (mode === "pull_requests") {
    const backend = createGitHubPRsBackend(owner, repo, token);
    const pipeline = createGitHubPRsPipeline(owner, repo);
    return new PollingSensor(config, backend, pipeline);
  }

  // default: issues
  const backend = createGitHubIssuesBackend(owner, repo, token);
  const pipeline = createGitHubIssuesPipeline(owner, repo);
  return new PollingSensor(config, backend, pipeline);
}
