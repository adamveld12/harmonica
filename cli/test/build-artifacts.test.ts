import { existsSync } from "node:fs";
import { join } from "path";
import { describe, test, expect } from "bun:test";

const cliDir = join(import.meta.dir, "..");

describe("build artifacts", () => {
  test("dist/server/index.js exists", () => {
    expect(existsSync(join(cliDir, "dist/server/index.js"))).toBe(true);
  });

  test("dist/ui/index.html exists", () => {
    expect(existsSync(join(cliDir, "dist/ui/index.html"))).toBe(true);
  });

  test("README.md exists", () => {
    expect(existsSync(join(cliDir, "README.md"))).toBe(true);
  });

  test("dist/ui/ contains JS assets", () => {
    const assetsDir = join(cliDir, "dist/ui/assets");
    expect(existsSync(assetsDir)).toBe(true);
  });
});
