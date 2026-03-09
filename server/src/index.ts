#!/usr/bin/env bun
import { resolve, join } from "path";
import { statSync } from "fs";
import { WorkflowManager } from "./orchestrator/workflow-manager.ts";
import { startDashboardServer, type GlobalSettings } from "./observability/server.ts";
import { HarmonicaDB } from "./observability/db.ts";
import { logger } from "./observability/logger.ts";
import { loadSensors, watchSensors } from "./config/sensor-loader.ts";
import { SensorManager } from "./integration/sensor/sensor-manager.ts";
import { expandHome } from "./config/resolver.ts";
import { DEFAULTS } from "./config/defaults.ts";

function parseArgs(args: string[]): {
  workflows?: string;
  configDir?: string;
  serverPort?: number;
  serverHost?: string;
  workspaceRepoUrl?: string;
  envFile?: string;
  debug: boolean;
  help: boolean;
} {
  const result: {
    workflows?: string;
    configDir?: string;
    serverPort?: number;
    serverHost?: string;
    workspaceRepoUrl?: string;
    envFile?: string;
    debug: boolean;
    help: boolean;
  } = {
    debug: false,
    help: false,
  };
  for (let i = 0; i < args.length; i++) {
    let arg = args[i];
    let nextVal: string | undefined;
    const eqIdx = arg.indexOf("=");
    if (eqIdx !== -1) {
      nextVal = arg.slice(eqIdx + 1);
      arg = arg.slice(0, eqIdx);
    }
    if (arg === "--help" || arg === "-h") result.help = true;
    else if (arg === "--debug") result.debug = true;
    else if (arg === "--workflows") {
      const v = nextVal ?? args[++i];
      if (v) result.workflows = v;
    } else if (arg === "--config-dir") {
      const v = nextVal ?? args[++i];
      if (v) result.configDir = v;
    } else if (arg === "--server.port") {
      const v = nextVal ?? args[++i];
      if (v) result.serverPort = parseInt(v, 10);
    } else if (arg === "--server.host") {
      const v = nextVal ?? args[++i];
      if (v) result.serverHost = v;
    } else if (arg === "--workspace.repo_url") {
      const v = nextVal ?? args[++i];
      if (v) result.workspaceRepoUrl = v;
    } else if (arg === "--env-file") {
      const v = nextVal ?? args[++i];
      if (v) result.envFile = v;
    }
  }
  return result;
}

async function loadEnvFile(path: string, required: boolean): Promise<void> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    if (required) logger.warn("env file not found", { path });
    return;
  }
  const text = await file.text();
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key || key in process.env) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

const HELP = `
Usage: harmonica [options]

Options:
  --workflows <path>         Path to a directory of .md workflow files
                             (default: ./workflows/)
  --config-dir <path>        Config/data directory (env: HARM_CONFIG_DIR; default: ~/.harmonica)
                             Contains harmonica.db and workspaces/
  --server.port <num>        HTTP dashboard port (env: HARM_SERVER_PORT)
  --server.host <host>       HTTP dashboard host (env: HARM_SERVER_HOST)
  --workspace.repo_url <url> Repository URL for workspaces
  --env-file <path>          Path to .env file (default: ./.env if present)
  --debug                    Enable debug logging
  --help, -h                 Show this help
`.trim();

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }

  if (args.envFile) {
    await loadEnvFile(resolve(args.envFile), true);
  } else {
    await loadEnvFile(resolve(process.cwd(), ".env"), false);
  }

  const workflowsPath = args.workflows ? resolve(args.workflows) : resolve(process.cwd(), "workflows");
  logger.info("harmonica starting", { workflows: workflowsPath });
  logger.info("resolved config", {
    configDir: args.configDir ?? process.env.HARM_CONFIG_DIR ?? DEFAULTS.config_dir,
    serverPort: args.serverPort ?? null,
    workspaceRepoUrl: args.workspaceRepoUrl ?? null,
    debug: args.debug,
  });

  const serverPort =
    args.serverPort ?? (process.env.HARM_SERVER_PORT ? parseInt(process.env.HARM_SERVER_PORT, 10) : undefined);
  const serverHost = args.serverHost ?? process.env.HARM_SERVER_HOST;

  const rawConfigDir = args.configDir ?? process.env.HARM_CONFIG_DIR ?? DEFAULTS.config_dir;
  const configDir = resolve(expandHome(rawConfigDir));
  const workspacesDir = join(configDir, "workspaces");
  const dbPath = join(configDir, "harmonica.db");
  await Bun.$.cwd(process.cwd())`mkdir -p ${workspacesDir}`.quiet();

  let db: HarmonicaDB | undefined;
  try {
    db = new HarmonicaDB(dbPath);
    logger.info("database opened", { path: dbPath });
  } catch (err) {
    logger.warn("database failed to open, completed sessions will not be persisted", { error: String(err) });
  }

  const sensorsConfig = await loadSensors(process.cwd());
  const sensorManager = new SensorManager(sensorsConfig);
  await sensorManager.start();

  const stopSensorWatcher = watchSensors(process.cwd(), (newConfig) => {
    sensorManager.updateConfig(newConfig);
  });

  const manager = new WorkflowManager(workspacesDir, db, sensorManager, args.workspaceRepoUrl);

  // Load workflows from directory
  let stat;
  try {
    stat = statSync(workflowsPath);
  } catch (err) {
    logger.error("workflows path not found", { path: workflowsPath, error: String(err) });
    process.exit(1);
  }

  if (!stat.isDirectory()) {
    logger.error("workflows path must be a directory", { path: workflowsPath });
    process.exit(1);
  }

  try {
    await manager.loadDirectory(workflowsPath);
  } catch (err) {
    logger.error("failed to load workflow(s)", { path: workflowsPath, error: String(err) });
    process.exit(1);
  }

  if (manager.listWorkflows().length === 0) {
    logger.error("no workflows loaded, exiting");
    process.exit(1);
  }

  const globalSettings: GlobalSettings = {
    configDir,
    workspacesDir,
    dbPath,
    serverPort,
    serverHost,
    workflowsPath,
    repoUrlOverride: args.workspaceRepoUrl,
    debug: args.debug,
  };

  let server: { stop(): void } | null = null;
  if (serverPort) {
    try {
      const dashServer = startDashboardServer(serverPort, manager, serverHost ?? "localhost", db, globalSettings);
      server = dashServer;
      manager.setNotifyHandler((event) => dashServer.notify(event));
      logger.info("dashboard started", { port: serverPort, ...(serverHost ? { host: serverHost } : {}) });
    } catch (err) {
      logger.warn("dashboard failed to start", { error: String(err) });
    }
  }

  let shuttingDown = false;
  const handleShutdown = async () => {
    if (shuttingDown) {
      logger.info("forced shutdown");
      process.exit(1);
    }
    shuttingDown = true;
    logger.info("received shutdown signal");
    server?.stop();
    await manager.shutdownAll();
    stopSensorWatcher();
    sensorManager.stopAll();
    db?.close();
    process.exit(0);
  };

  process.on("SIGINT", handleShutdown);
  process.on("SIGTERM", handleShutdown);

  logger.info("harmonica running", { pid: process.pid, workflows: manager.listWorkflows() });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
