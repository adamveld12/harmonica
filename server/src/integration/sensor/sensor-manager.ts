import { logger } from "../../observability/logger.ts";
import type { SensorsFileConfig, TrackerConfig, SensorConfig } from "../../config/schema.ts";
import type { TrackerClient } from "../tracker.ts";
import type { Sensor } from "./types.ts";
import { SensorTrackerClient } from "./sensor-tracker.ts";
import { createLinearSensor } from "../linear/factory.ts";
import { createGitHubSensor } from "../github/factory.ts";

function createSensor(config: SensorConfig): Sensor {
  if (config.type === "github") {
    return createGitHubSensor(config);
  }
  return createLinearSensor(config);
}

export class SensorManager {
  private sensors = new Map<string, { sensor: Sensor; rawConfig: SensorConfig }>();

  constructor(sensorsConfig: SensorsFileConfig) {
    for (const [name, config] of Object.entries(sensorsConfig)) {
      this.sensors.set(name, { sensor: createSensor(config), rawConfig: config });
    }
  }

  async start(): Promise<void> {
    await Promise.all(
      Array.from(this.sensors.entries()).map(async ([name, { sensor }]) => {
        logger.info("sensor starting", { name });
        await sensor.start();
        logger.info("sensor started", { name });
      }),
    );
  }

  stopAll(): void {
    for (const [name, { sensor }] of this.sensors) {
      sensor.stop();
      logger.info("sensor stopped", { name });
    }
  }

  getTracker(
    trackerConfig: TrackerConfig,
    workflowId: string,
  ): { tracker: TrackerClient; resolvedConfig: TrackerConfig } {
    const sensorName = trackerConfig.sensor;
    const entry = this.sensors.get(sensorName);
    if (!entry) {
      throw new Error(`Sensor "${sensorName}" not found. Check .agents/sensors.yaml`);
    }

    const { sensor } = entry;
    sensor.subscribe(workflowId, trackerConfig);

    const sensorConfig = sensor.getConfig();

    // Patch tracker config with sensor-derived values
    const resolvedConfig: TrackerConfig = {
      ...trackerConfig,
      mode: trackerConfig.mode ?? sensorConfig.mode,
    };

    // Linear-specific: propagate api_key and assignees fallback
    if (sensorConfig.type === "linear") {
      resolvedConfig.api_key = sensorConfig.api_key;
      if (!resolvedConfig.filter_assignees) {
        resolvedConfig.filter_assignees = sensorConfig.assignees;
      }
    }

    const tracker = new SensorTrackerClient(sensor, resolvedConfig);
    return { tracker, resolvedConfig };
  }

  unsubscribe(workflowId: string): void {
    for (const { sensor } of this.sensors.values()) {
      sensor.unsubscribe(workflowId);
    }
  }

  updateConfig(newConfig: SensorsFileConfig): void {
    const newNames = new Set(Object.keys(newConfig));
    const oldNames = new Set(this.sensors.keys());

    // Stop removed sensors
    for (const name of oldNames) {
      if (!newNames.has(name)) {
        this.sensors.get(name)!.sensor.stop();
        this.sensors.delete(name);
        logger.info("sensor removed", { name });
      }
    }

    // Start added sensors
    for (const name of newNames) {
      if (!oldNames.has(name)) {
        const config = newConfig[name];
        const sensor = createSensor(config);
        this.sensors.set(name, { sensor, rawConfig: config });
        sensor.start().catch((err) => logger.error("sensor start error", { name, error: String(err) }));
        logger.info("sensor added", { name });
      }
    }

    // Restart changed sensors
    for (const name of newNames) {
      if (!oldNames.has(name)) continue; // already handled above
      const existing = this.sensors.get(name)!;
      const newCfg = newConfig[name];
      // Detect change by comparing serialized config
      if (JSON.stringify(newCfg) !== JSON.stringify(existing.rawConfig)) {
        existing.sensor.stop();
        const sensor = createSensor(newCfg);
        this.sensors.set(name, { sensor, rawConfig: newCfg });
        sensor.start().catch((err) => logger.error("sensor restart error", { name, error: String(err) }));
        logger.info("sensor restarted", { name });
      }
    }
  }
}
