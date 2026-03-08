import { describe, test, expect, afterAll } from "bun:test";
import { join } from "path";

const serverEntry = join(import.meta.dir, "..", "dist/server/index.js");

describe("dashboard boot", () => {
  let proc: import("bun").Subprocess | null = null;
  const port = 10000 + Math.floor(Math.random() * 50000);

  afterAll(() => {
    proc?.kill();
  });

  test("server starts and serves dashboard HTML on /", async () => {
    // Start the server with --server.port, no workflows (will warn but still serve HTTP)
    proc = Bun.spawn(
      [
        "bun",
        "run",
        serverEntry,
        "--server.port",
        String(port),
        "--server.host",
        "127.0.0.1",
        "--workflows",
        "/tmp/harmonica-test-empty-workflows",
      ],
      { stdout: "pipe", stderr: "pipe" },
    );

    // Wait for server to be ready (poll with timeout)
    const deadline = Date.now() + 10_000;
    let ready = false;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/`);
        if (res.ok) {
          ready = true;
          break;
        }
      } catch {
        /* not ready yet */
      }
      await Bun.sleep(200);
    }

    expect(ready).toBe(true);

    // Verify HTML is served
    const html = await fetch(`http://127.0.0.1:${port}/`);
    expect(html.status).toBe(200);
    expect(html.headers.get("content-type")).toContain("text/html");

    // Verify API endpoint exists
    const api = await fetch(`http://127.0.0.1:${port}/api/v1/workflows`);
    expect(api.status).toBe(200);
  });
});
