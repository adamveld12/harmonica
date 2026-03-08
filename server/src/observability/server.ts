import type { NotificationEvent } from "../types.ts";
import type { HarmonicaDB } from "./db.ts";
import type { WorkflowManager } from "../orchestrator/workflow-manager.ts";
import type { Config } from "../config/schema.ts";
import { join } from "path";
import { existsSync } from "node:fs";

export interface DashboardServer {
  port: number;
  stop(): void;
  notify(event: NotificationEvent): void;
}

export interface GlobalSettings {
  configDir: string;
  workspacesDir: string;
  dbPath: string;
  serverPort?: number;
  serverHost?: string;
  workflowsPath: string;
  repoUrlOverride?: string;
  debug: boolean;
}

function sanitizeConfig(config: Config): Omit<Config, "tracker"> & { tracker: Omit<Config["tracker"], "api_key"> } {
  const { api_key: _tKey, ...tracker } = config.tracker;
  const { api_key: _aKey, ...agent } = config.agent;
  return { ...config, tracker, agent };
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

function mimeFor(path: string): string {
  const ext = path.match(/\.[^.]+$/)?.[0] ?? "";
  return MIME[ext] ?? "application/octet-stream";
}

export function startDashboardServer(
  port: number,
  manager: WorkflowManager,
  host?: string,
  db?: HarmonicaDB,
  settings?: GlobalSettings,
): DashboardServer {
  const clients = new Set<ReadableStreamDefaultController>();

  function broadcastWorkflows() {
    const raw = manager.getAllSnapshots();
    const workflows: Record<string, unknown> = {};
    for (const [id, entry] of Object.entries(raw)) {
      workflows[id] = { ...entry, config: sanitizeConfig(entry.config) };
    }
    const data = JSON.stringify({ workflows });
    const msg = `event: state\ndata: ${data}\n\n`;
    for (const ctrl of clients) {
      try {
        ctrl.enqueue(msg);
      } catch {
        clients.delete(ctrl);
      }
    }
  }

  function broadcastNotification(event: NotificationEvent) {
    const msg = `event: notification\ndata: ${JSON.stringify(event)}\n\n`;
    for (const ctrl of clients) {
      try {
        ctrl.enqueue(msg);
      } catch {
        clients.delete(ctrl);
      }
    }
  }

  // Track last-seen state per workflow for change detection
  const lastPollAts: Record<string, number> = {};
  const lastRunningSizes: Record<string, number> = {};
  const lastPendingSizes: Record<string, number> = {};

  const sseInterval = setInterval(() => {
    const snapshots = manager.getAllSnapshots();
    let changed = false;
    for (const [id, { snapshot }] of Object.entries(snapshots)) {
      if (
        snapshot.lastPollAt !== lastPollAts[id] ||
        snapshot.running.length !== lastRunningSizes[id] ||
        (snapshot.pending?.length ?? 0) !== (lastPendingSizes[id] ?? 0)
      ) {
        lastPollAts[id] = snapshot.lastPollAt;
        lastRunningSizes[id] = snapshot.running.length;
        lastPendingSizes[id] = snapshot.pending?.length ?? 0;
        changed = true;
      }
    }
    if (changed && clients.size > 0) {
      broadcastWorkflows();
    }
  }, 1_000);

  const uiDistDir = (() => {
    // Published: dist/server/*.js → ../ui (sibling under dist/)
    const fromDist = join(import.meta.dir, "..", "ui");
    if (existsSync(fromDist)) return fromDist;
    // Dev: server/src/observability/*.ts → ../../../ui/dist
    return join(import.meta.dir, "..", "..", "..", "ui", "dist");
  })();

  const server = Bun.serve({
    port,
    idleTimeout: 0,
    ...(host ? { hostname: host } : {}),
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      // SSE
      if (path === "/api/v1/events" && req.method === "GET") {
        let ctrl!: ReadableStreamDefaultController;
        const stream = new ReadableStream({
          start(c) {
            ctrl = c;
            clients.add(ctrl);
            // Send initial state
            const raw = manager.getAllSnapshots();
            const workflows: Record<string, unknown> = {};
            for (const [id, entry] of Object.entries(raw)) {
              workflows[id] = { ...entry, config: sanitizeConfig(entry.config) };
            }
            const data = JSON.stringify({ workflows });
            ctrl.enqueue(`event: state\ndata: ${data}\n\n`);
          },
          cancel() {
            clients.delete(ctrl);
          },
        });

        req.signal.addEventListener("abort", () => {
          clients.delete(ctrl);
          try {
            ctrl.close();
          } catch {
            // ignore close errors on already-closed streams
          }
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }

      // GET /api/v1/workflows — list all workflow IDs with summary
      if (path === "/api/v1/workflows" && req.method === "GET") {
        const snapshots = manager.getAllSnapshots();
        const list = Object.entries(snapshots).map(([id, { snapshot, config, name, description }]) => ({
          id,
          runningCount: snapshot.running.length,
          retryCount: snapshot.retryQueue.length,
          isShuttingDown: snapshot.isShuttingDown,
          lastPollAt: snapshot.lastPollAt,
          model: config.agent.model,
          maxConcurrency: config.agent.max_concurrency,
          name,
          description,
        }));
        return Response.json(list);
      }

      // GET /api/v1/settings
      if (path === "/api/v1/settings" && req.method === "GET") {
        return Response.json(settings ?? null);
      }

      // GET /api/v1/workflows/:id/state
      const workflowStateMatch = path.match(/^\/api\/v1\/workflows\/([^/]+)\/state$/);
      if (workflowStateMatch && req.method === "GET") {
        const id = workflowStateMatch[1];
        const instance = manager.getInstance(id);
        if (!instance) return new Response("Not Found", { status: 404 });
        const snapshots = manager.getAllSnapshots();
        return Response.json(snapshots[id]?.snapshot ?? null);
      }

      // GET /api/v1/workflows/:id/completed
      const workflowCompletedMatch = path.match(/^\/api\/v1\/workflows\/([^/]+)\/completed$/);
      if (workflowCompletedMatch && req.method === "GET") {
        const id = workflowCompletedMatch[1];
        if (!manager.getInstance(id)) return new Response("Not Found", { status: 404 });
        const completed = db ? db.listCompleted(50, id) : [];
        return Response.json(completed);
      }

      // POST /api/v1/workflows/:id/refresh
      const workflowRefreshMatch = path.match(/^\/api\/v1\/workflows\/([^/]+)\/refresh$/);
      if (workflowRefreshMatch && req.method === "POST") {
        const id = workflowRefreshMatch[1];
        manager.triggerRefresh(id);
        return Response.json({ ok: true });
      }

      // POST /api/v1/workflows/:id/:itemId/stop
      const stopMatch = url.pathname.match(/^\/api\/v1\/workflows\/([^/]+)\/([^/]+)\/stop$/);
      if (stopMatch && req.method === "POST") {
        const [, wfId, itemId] = stopMatch;
        const inst = manager.getInstance(wfId);
        if (!inst) return Response.json({ error: "workflow not found" }, { status: 404 });
        const stopped = inst.orchestrator.abortWorker(itemId);
        if (!stopped) return Response.json({ error: "worker not found" }, { status: 404 });
        return Response.json({ ok: true });
      }

      // GET /api/v1/workflows/:id/:issueId/output  (live output for running worker)
      const workflowLiveOutputMatch = path.match(/^\/api\/v1\/workflows\/([^/]+)\/([^/]+)\/output$/);
      if (workflowLiveOutputMatch && req.method === "GET") {
        const [, id, issueId] = workflowLiveOutputMatch;
        const instance = manager.getInstance(id);
        if (!instance) return new Response("Not Found", { status: 404 });
        const since = parseInt(url.searchParams.get("since") ?? "0", 10);
        const state = instance.orchestrator.getState();
        const all = state.outputLogs.get(issueId) ?? [];
        const lines = all.slice(since);
        return Response.json({ lines, nextIndex: since + lines.length });
      }

      // GET /api/v1/completed/{issueId}/output — query DB by unique issueId
      const completedOutputMatch = path.match(/^\/api\/v1\/completed\/([^/]+)\/output$/);
      if (completedOutputMatch && req.method === "GET") {
        const issueId = completedOutputMatch[1];
        const lines = db ? db.getSessionOutput(issueId) : [];
        return Response.json(lines);
      }

      // Static file serving
      if (req.method === "GET" && !path.startsWith("/api/")) {
        const safePath = path === "/" ? "/index.html" : path;
        const filePath = join(uiDistDir, safePath);
        const file = Bun.file(filePath);
        if (await file.exists()) {
          return new Response(file, { headers: { "Content-Type": mimeFor(filePath) } });
        }
        const index = Bun.file(join(uiDistDir, "index.html"));
        if (await index.exists()) {
          return new Response(index, { headers: { "Content-Type": "text/html; charset=utf-8" } });
        }
        return new Response("Not Found", { status: 404 });
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  return {
    port: server.port ?? port,
    stop() {
      clearInterval(sseInterval);
      for (const ctrl of clients) {
        try {
          ctrl.close();
        } catch {
          // ignore close errors on already-closed streams
        }
      }
      clients.clear();
      server.stop();
    },
    notify: broadcastNotification,
  };
}
