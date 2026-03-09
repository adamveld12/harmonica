/**
 * @harmonica/sensor-github — GitHub issue/PR/project sensor for Harmonica.
 * Polls GitHub via the `gh` CLI, normalizes to WorkItem via SensorPipeline.
 */

import type { Sensor } from "@harmonica/sensor-core";
import { GitHubSensorSchema } from "./schema.ts";
import { createGitHubSensor } from "./factory.ts";

export const sensorType = "github";
export { GitHubSensorSchema as schema } from "./schema.ts";
export type { GitHubSensorConfig } from "./schema.ts";
export { createGitHubSensor } from "./factory.ts";

export function createSensor(config: unknown): Sensor {
  return createGitHubSensor(GitHubSensorSchema.parse(config));
}
