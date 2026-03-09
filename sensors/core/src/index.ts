/**
 * @harmonica/sensor-core — Generic sensor framework for Harmonica.
 *
 * Provides the polling engine, shared types, and tracker interface.
 * Sensor implementations (linear, github, etc.) depend on this package
 * and plug into PollingSensor via SensorBackend + SensorPipeline.
 */

export type { IssueState, NormalizedIssue, NormalizedMilestone, NormalizedProject, WorkItem } from "./work-item.ts";
export { getWorkItemAssigneeName, getWorkItemProjectName } from "./work-item.ts";

export type {
  StateClassificationConfig,
  SensorBackend,
  SensorPipeline,
  SensorConfigBase,
  Sensor,
  SensorFactory,
  SensorModule,
} from "./sensor.ts";

export { PollingSensor } from "./polling-sensor.ts";

export type { TrackerClient } from "./tracker.ts";
export { SensorTrackerClient } from "./sensor-tracker.ts";

export { SensorConfigLoose, SensorsFileSchema, TrackerSchema } from "./config.ts";
export type { SensorsFileConfig, SensorConfigLooseType, TrackerConfig } from "./config.ts";

export { logger } from "./logger.ts";

export type { McpServerConfig } from "./types.ts";
