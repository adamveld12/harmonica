/**
 * @harmonica/sensor-linear — Linear issue/project sensor for Harmonica.
 * Polls Linear's GraphQL API via SensorBackend, normalizes to WorkItem via SensorPipeline.
 */

import type { Sensor } from "@harmonica/sensor-core";
import { LinearSensorSchema } from "./schema.ts";
import { createLinearSensor } from "./factory.ts";

export const sensorType = "linear";
export { LinearSensorSchema as schema } from "./schema.ts";
export type { LinearSensorConfig } from "./schema.ts";
export { createLinearSensor } from "./factory.ts";
export { createLinearMcpServerConfig } from "./mcp-tool.ts";

export function createSensor(config: unknown): Sensor {
  return createLinearSensor(LinearSensorSchema.parse(config));
}
