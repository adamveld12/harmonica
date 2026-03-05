#!/usr/bin/env bun
import { resolve, join } from "path";
import { statSync } from "fs";
import { WorkflowManager } from "./orchestrator/workflow-manager.ts";
import { startDashboardServer } from "./observability/server.ts";
import { HarmonicaDB } from "./observability/db.ts";
import { logger } from "./observability/logger.ts";
import { loadSensors, watchSensors } from "./config/sensor-loader.ts";
import { SensorManager } from "./integration/sensor-manager.ts";
import { expandHome } from "./config/resolver.ts";
import { DEFAULTS } from "./config/defaults.ts";

function parseArgs(args: string[]): {
  workflows?: string;
  config?: string;
  serverPort?: number;
  serverHost?: string;
  workspaceRepoUrl?: string;
  envFile?: string;
  debug: boolean;
  help: boolean;
} {
  const result: { workflows?: string; config?: string; serverPort?: number; serverHost?: string; workspaceRepoUrl?: string; envFile?: string; debug: boolean; help: boolean } = {
    debug: false,
    help: false,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") result.help = true;
    else if (arg === "--debug") result.debug = true;
    // Support both --workflows (new) and --workflow (legacy alias)
    else if ((arg === "--workflows" || arg === "--workflow") && args[i + 1]) result.workflows = args[++i];
    else if (arg === "--config" && args[i + 1]) result.config = args[++i];
    else if (arg === "--server.port" && args[i + 1]) result.serverPort = parseInt(args[++i], 10);
    else if (arg === "--server.host" && args[i + 1]) result.serverHost = args[++i];
    else if (arg === "--workspace.repo_url" && args[i + 1]) result.workspaceRepoUrl = args[++i];
    else if (arg === "--env-file" && args[i + 1]) result.envFile = args[++i];
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
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

const HELP = `
Usage: harmonica [options]

Options:
  --workflows <path>         Path to a WORKFLOW.md file or directory of .md files
                             (default: ./workflows/ if exists, else ./WORKFLOW.md)
  --workflow <path>          Alias for --workflows (backward compat)
  --config <path>            Path to separate YAML config file (single-file mode only)
  --server.port <num>        HTTP dashboard port (env: HARM_SERVER_PORT)
  --server.host <host>       HTTP dashboard host (env: HARM_SERVER_HOST)
  --workspace.repo_url <url> Repository URL for workspaces (env: HARM_REPO_URL)
  --env-file <path>          Path to .env file (default: ./.env if present)
  --debug                    Enable debug logging
  --help, -h                 Show this help

Environment:
  HARM_CONFIG_DIR            Config/data directory (default: ~/.harmonica)
                             Contains harmonica.db and workspaces/

WORKFLOW.md format:
  YAML frontmatter (between ---) contains config.
  Body is a Liquid template for the agent prompt.
`.trim();

function resolveWorkflowsPath(arg?: string): string {
  if (arg) return resolve(arg);
  // Auto-detect: prefer ./workflows/ dir, then ./WORKFLOW.md
  const dir = resolve(process.cwd(), "workflows");
  try {
    const stat = statSync(dir);
    if (stat.isDirectory()) return dir;
  } catch {}
  return resolve(process.cwd(), "WORKFLOW.md");
}

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

  const workflowsPath = resolveWorkflowsPath(args.workflows);
  logger.info("harmonica starting", { workflows: workflowsPath });

  const serverPort = args.serverPort ?? (process.env.HARM_SERVER_PORT ? parseInt(process.env.HARM_SERVER_PORT, 10) : undefined);
  const serverHost = args.serverHost ?? process.env.HARM_SERVER_HOST;

  const rawConfigDir = process.env.HARM_CONFIG_DIR ?? DEFAULTS.config_dir;
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

  const manager = new WorkflowManager(workspacesDir, db, sensorManager);

  // Load workflow(s)
  let isDir = false;
  try {
    const stat = statSync(workflowsPath);
    isDir = stat.isDirectory();
  } catch (err) {
    logger.error("workflows path not found", { path: workflowsPath, error: String(err) });
    process.exit(1);
  }

  try {
    if (isDir) {
      await manager.loadDirectory(workflowsPath);
    } else {
      await manager.loadSingleFile(workflowsPath);
    }
  } catch (err) {
    logger.error("failed to load workflow(s)", { path: workflowsPath, error: String(err) });
    process.exit(1);
  }

  if (manager.listWorkflows().length === 0) {
    logger.error("no workflows loaded, exiting");
    process.exit(1);
  }

  let server: { stop(): void } | null = null;
  if (serverPort) {
    try {
      const dashServer = startDashboardServer(serverPort, manager, serverHost ?? "localhost", db);
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

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
