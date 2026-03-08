import { logger } from "../observability/logger.ts";
import type { SensorsFileConfig, TrackerConfig } from "../config/schema.ts";
import type { TrackerClient } from "./tracker.ts";
import { LinearSensor } from "./sensor.ts";
import { SensorTrackerClient } from "./sensor-tracker.ts";

export class SensorManager {
  private sensors = new Map<string, LinearSensor>();

  constructor(sensorsConfig: SensorsFileConfig) {
    for (const [name, config] of Object.entries(sensorsConfig)) {
      this.sensors.set(name, new LinearSensor(config));
    }
  }

  async start(): Promise<void> {
    await Promise.all(
      Array.from(this.sensors.entries()).map(async ([name, sensor]) => {
        logger.info("sensor starting", { name });
        await sensor.start();
        logger.info("sensor started", { name });
      }),
    );
  }

  stopAll(): void {
    for (const [name, sensor] of this.sensors) {
      sensor.stop();
      logger.info("sensor stopped", { name });
    }
  }

  getTracker(
    trackerConfig: TrackerConfig,
    workflowId: string,
  ): { tracker: TrackerClient; resolvedConfig: TrackerConfig } {
    const sensorName = trackerConfig.sensor;
    const sensor = this.sensors.get(sensorName);
    if (!sensor) {
      throw new Error(`Sensor "${sensorName}" not found. Check .agents/sensors.yaml`);
    }

    sensor.subscribe(workflowId, trackerConfig);

    // Patch tracker config with sensor's api_key, mode, and states
    const resolvedConfig: TrackerConfig = {
      ...trackerConfig,
      api_key: sensor.getApiKey(),
      mode: sensor.getMode(),
      filter_assignees: trackerConfig.filter_assignees ?? sensor.getConfig().assignees,
    };

    const tracker = new SensorTrackerClient(sensor, resolvedConfig);
    return { tracker, resolvedConfig };
  }

  unsubscribe(workflowId: string): void {
    for (const sensor of this.sensors.values()) {
      sensor.unsubscribe(workflowId);
    }
  }

  updateConfig(newConfig: SensorsFileConfig): void {
    const newNames = new Set(Object.keys(newConfig));
    const oldNames = new Set(this.sensors.keys());

    // Stop removed sensors
    for (const name of oldNames) {
      if (!newNames.has(name)) {
        this.sensors.get(name)!.stop();
        this.sensors.delete(name);
        logger.info("sensor removed", { name });
      }
    }

    // Start added sensors
    for (const name of newNames) {
      if (!oldNames.has(name)) {
        const sensor = new LinearSensor(newConfig[name]);
        this.sensors.set(name, sensor);
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
      if (JSON.stringify(newCfg) !== JSON.stringify(existing.getConfig())) {
        existing.stop();
        const sensor = new LinearSensor(newCfg);
        this.sensors.set(name, sensor);
        sensor.start().catch((err) => logger.error("sensor restart error", { name, error: String(err) }));
        logger.info("sensor restarted", { name });
      }
    }
  }
}
