import type { NotificationEvent } from "../types.ts";
import type { HarmonicaDB } from "./db.ts";
import type { WorkflowManager } from "../orchestrator/workflow-manager.ts";
import { join } from "path";
import { existsSync } from "node:fs";

export interface DashboardServer {
  port: number;
  stop(): void;
  notify(event: NotificationEvent): void;
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
): DashboardServer {
  const clients = new Set<ReadableStreamDefaultController>();

  function broadcastWorkflows() {
    const workflows = manager.getAllSnapshots();
    const data = JSON.stringify({ workflows });
    const msg = `event: state\ndata: ${data}\n\n`;
    for (const ctrl of clients) {
      try { ctrl.enqueue(msg); } catch { clients.delete(ctrl); }
    }
  }

  function broadcastNotification(event: NotificationEvent) {
    const msg = `event: notification\ndata: ${JSON.stringify(event)}\n\n`;
    for (const ctrl of clients) {
      try { ctrl.enqueue(msg); } catch { clients.delete(ctrl); }
    }
  }

  // Track last-seen state per workflow for change detection
  let lastPollAts: Record<string, number> = {};
  let lastRunningSizes: Record<string, number> = {};
  let lastPendingSizes: Record<string, number> = {};

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
    // Published package: dist/*.js → ../ui/dist
    const fromDist = join(import.meta.dir, "..", "ui", "dist");
    if (existsSync(fromDist)) return fromDist;
    // Dev mode: src/observability/*.ts → ../../ui/dist
    return join(import.meta.dir, "..", "..", "ui", "dist");
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
            const workflows = manager.getAllSnapshots();
            const data = JSON.stringify({ workflows });
            ctrl.enqueue(`event: state\ndata: ${data}\n\n`);
          },
          cancel() { clients.delete(ctrl); },
        });

        req.signal.addEventListener("abort", () => {
          clients.delete(ctrl);
          try { ctrl.close(); } catch {}
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
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

      // GET /api/v1/workflows/:id/state
      const workflowStateMatch = path.match(/^\/api\/v1\/workflows\/([^/]+)\/state$/);
      if (workflowStateMatch && req.method === "GET") {
        const id = workflowStateMatch[1];
        const instance = manager.getInstance(id);
        if (!instance) return new Response("Not Found", { status: 404 });
        const snapshots = manager.getAllSnapshots();
        return Response.json(snapshots[id]?.snapshot ?? null);
      }

      // GET /api/v1/workflows/:id/config
      const workflowConfigMatch = path.match(/^\/api\/v1\/workflows\/([^/]+)\/config$/);
      if (workflowConfigMatch && req.method === "GET") {
        const id = workflowConfigMatch[1];
        const instance = manager.getInstance(id);
        if (!instance) return new Response("Not Found", { status: 404 });
        const c = instance.config;
        return Response.json({
          model: c.agent.model,
          max_turns: c.agent.max_turns,
          max_concurrency: c.agent.max_concurrency,
          permission_mode: c.agent.permission_mode,
          auth_method: c.agent.auth_method,
          poll_interval_ms: c.poll_interval_ms,
          stall_timeout_ms: c.stall_timeout_ms,
          name: instance.name,
          description: instance.description,
          repo_url: c.workspace.repo_url,
          base_dir: manager.getWorkspacesDir(),
          cleanup_on_start: c.workspace.cleanup_on_start,
          cleanup_on_terminal: c.workspace.cleanup_on_terminal,
        });
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

      // --- Backward-compat aggregate endpoints ---

      // GET /api/v1/state  — all workflow snapshots keyed by id
      if (path === "/api/v1/state" && req.method === "GET") {
        const snapshots = manager.getAllSnapshots();
        const result: Record<string, unknown> = {};
        for (const [id, { snapshot }] of Object.entries(snapshots)) result[id] = snapshot;
        return Response.json(result);
      }

      // GET /api/v1/config  — first workflow's config (or keyed map)
      if (path === "/api/v1/config" && req.method === "GET") {
        const ids = manager.listWorkflows();
        if (ids.length === 0) return Response.json({});
        const instance = manager.getInstance(ids[0])!;
        const c = instance.config;
        return Response.json({
          model: c.agent.model,
          max_turns: c.agent.max_turns,
          max_concurrency: c.agent.max_concurrency,
          permission_mode: c.agent.permission_mode,
          auth_method: c.agent.auth_method,
          poll_interval_ms: c.poll_interval_ms,
          stall_timeout_ms: c.stall_timeout_ms,
          repo_url: c.workspace.repo_url,
          base_dir: manager.getWorkspacesDir(),
          cleanup_on_start: c.workspace.cleanup_on_start,
          cleanup_on_terminal: c.workspace.cleanup_on_terminal,
        });
      }

      // POST /api/v1/refresh  — refresh all
      if (path === "/api/v1/refresh" && req.method === "POST") {
        manager.triggerRefresh();
        return Response.json({ ok: true });
      }

      // GET /api/v1/completed  — all workflows
      if (path === "/api/v1/completed" && req.method === "GET") {
        const completed = db ? db.listCompleted(50) : [];
        return Response.json(completed);
      }

      // GET /api/v1/completed/{issueId}/output — search across all workflows
      const completedOutputMatch = path.match(/^\/api\/v1\/completed\/([^/]+)\/output$/);
      if (completedOutputMatch && req.method === "GET") {
        const issueId = completedOutputMatch[1];
        const lines = db ? db.getSessionOutput(issueId) : [];
        return Response.json(lines);
      }

      // GET /api/v1/{issueId}/output?since=N — search across all workflows
      const liveOutputMatch = path.match(/^\/api\/v1\/([^/]+)\/output$/);
      if (liveOutputMatch && req.method === "GET") {
        const issueId = liveOutputMatch[1];
        const since = parseInt(url.searchParams.get("since") ?? "0", 10);
        for (const instance of Object.values(manager.getAllSnapshots())) {
          // Look in each orchestrator's state
          const id = instance.snapshot.workflowId;
          if (!id) continue;
          const inst = manager.getInstance(id);
          if (!inst) continue;
          const all = inst.orchestrator.getState().outputLogs.get(issueId);
          if (all) {
            const lines = all.slice(since);
            return Response.json({ lines, nextIndex: since + lines.length });
          }
        }
        return Response.json({ lines: [], nextIndex: since });
      }

      // GET /api/v1/{issueId} — search across all workflows
      const issueMatch = path.match(/^\/api\/v1\/([^/]+)$/);
      if (issueMatch && req.method === "GET") {
        const issueId = issueMatch[1];
        for (const id of manager.listWorkflows()) {
          const inst = manager.getInstance(id);
          if (!inst) continue;
          const entry = inst.orchestrator.getState().running.get(issueId);
          if (entry) {
            return Response.json({
              issueId: entry.workItem.id,
              issueIdentifier: entry.workItem.identifier,
              issueTitle: entry.workItem.title,
              issueUrl: entry.workItem.url,
              issueLabels: entry.workItem.labels,
              issueStateLabel: entry.workItem.stateLabel,
              issueAssigneeName: entry.workItem.kind === "issue" ? entry.workItem.assigneeName : entry.workItem.leadName,
              issueProjectName: entry.workItem.kind === "issue" ? entry.workItem.projectName : null,
              workItemKind: entry.workItem.kind,
              sessionId: entry.sessionId,
              turnCount: entry.turnCount,
              attemptNumber: entry.attemptNumber,
              startedAt: entry.startedAt,
              lastEventAt: entry.lastEventAt,
              workspaceDir: entry.workspaceDir,
              workflowId: id,
            });
          }
        }
        return new Response("Not Found", { status: 404 });
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
        try { ctrl.close(); } catch {}
      }
      clients.clear();
      server.stop();
    },
    notify: broadcastNotification,
  };
}
