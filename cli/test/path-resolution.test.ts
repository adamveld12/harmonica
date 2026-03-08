import { join } from "path";
import { existsSync } from "node:fs";
import { describe, test, expect } from "bun:test";

const cliDir = join(import.meta.dir, "..");

describe("UI path resolution", () => {
  test("server dist can resolve ui dist via ../ui", () => {
    // This mirrors the path resolution in server/src/observability/server.ts
    const serverDistDir = join(cliDir, "dist/server");
    const uiDistDir = join(serverDistDir, "..", "ui");
    expect(existsSync(uiDistDir)).toBe(true);
    expect(existsSync(join(uiDistDir, "index.html"))).toBe(true);
  });
});
