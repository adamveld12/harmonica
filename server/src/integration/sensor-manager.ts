import { logger } from "../observability/logger.ts";
import type {
  SensorsFileConfig,
  TrackerConfig,
  Sensor,
  SensorModule,
  SensorTrackerClient,
} from "@harmonica/sensor-core";
import { SensorTrackerClient as SensorTrackerClientImpl } from "@harmonica/sensor-core";
import type { TrackerClient } from "@harmonica/sensor-core";

export class SensorManager {
  private sensors = new Map<string, { sensor: Sensor; rawConfig: SensorsFileConfig[string] }>();

  constructor(
    private rawConfigs: SensorsFileConfig,
    private builtins: Record<string, SensorModule>,
  ) {}

  async start(): Promise<void> {
    for (const [name, config] of Object.entries(this.rawConfigs)) {
      const sensor = await this.createSensor(name, config);
      this.sensors.set(name, { sensor, rawConfig: config });
    }

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

    const { sensor, rawConfig } = entry;
    sensor.subscribe(workflowId, trackerConfig);

    const sensorConfig = sensor.getConfig();

    // Patch tracker config with sensor-derived values
    const resolvedConfig: TrackerConfig = {
      ...trackerConfig,
      mode: trackerConfig.mode ?? (sensorConfig.mode as TrackerConfig["mode"]),
    };

    // Linear-specific: propagate api_key and assignees fallback
    if (sensorConfig.type === "linear") {
      const rc = rawConfig as Record<string, unknown>;
      resolvedConfig.api_key = rc["api_key"] as string | undefined;
      if (!resolvedConfig.filter_assignees) {
        resolvedConfig.filter_assignees = rc["assignees"] as string[] | undefined;
      }
    }

    const tracker = new SensorTrackerClientImpl(sensor, resolvedConfig);
    return { tracker, resolvedConfig };
  }

  unsubscribe(workflowId: string): void {
    for (const { sensor } of this.sensors.values()) {
      sensor.unsubscribe(workflowId);
    }
  }

  async updateConfig(newConfig: SensorsFileConfig): Promise<void> {
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
        const sensor = await this.createSensor(name, config);
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
        const sensor = await this.createSensor(name, newCfg);
        this.sensors.set(name, { sensor, rawConfig: newCfg });
        sensor.start().catch((err) => logger.error("sensor restart error", { name, error: String(err) }));
        logger.info("sensor restarted", { name });
      }
    }
  }

  private async createSensor(name: string, rawConfig: SensorsFileConfig[string]): Promise<Sensor> {
    const type = (rawConfig as Record<string, unknown>)["type"] as string;
    const mod = await this.resolveModule(type);
    const config = mod.schema.parse(rawConfig);
    logger.debug("sensor created", { name, type });
    return mod.createSensor(config);
  }

  private async resolveModule(type: string): Promise<SensorModule> {
    if (this.builtins[type]) return this.builtins[type];
    // Dynamic import for custom sensors
    const packageName = `@harmonica/sensor-${type}`;
    try {
      const mod = await import(packageName);
      if (!mod.createSensor || !mod.schema) {
        throw new Error(`${packageName} missing required exports (createSensor, schema)`);
      }
      return mod as SensorModule;
    } catch (err) {
      throw new Error(`Sensor type "${type}" not found. Install ${packageName} to use it. (${err})`);
    }
  }
}
