import { describe, expect, test } from "bun:test";
import { config, saveAppConfig, getDataDir } from "../src/config";
import os from "node:os";

describe("Config Management API", () => {
  test("returns current active configuration", () => {
    expect(config.port).toBeDefined();
    expect(typeof config.port).toBe("number");
  });

  test("updates runtime configuration", () => {
    const updated = saveAppConfig({ port: 5171 });
    expect(updated.port).toBe(5171);
    expect(config.port).toBe(5171);

    // Reset back to default
    saveAppConfig({ port: 5170 });
    expect(config.port).toBe(5170);
  });

  test("getDataDir returns valid app data directory", () => {
    const dataDir = getDataDir();
    expect(dataDir).toBeDefined();
    expect(typeof dataDir).toBe("string");
    expect(dataDir.length).toBeGreaterThan(0);
  });
});

