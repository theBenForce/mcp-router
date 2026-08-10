import { describe, expect, test } from "bun:test";
import { generateContainerName, getDefaultSidecarImage, sanitizeContainerName } from "../src/mcp/upstream/sidecar";

describe("sidecar container naming", () => {
  describe("sanitizeContainerName", () => {
    test("lowercases and replaces spaces/special characters with hyphens", () => {
      expect(sanitizeContainerName("My Server Name!")).toBe("my-server-name");
      expect(sanitizeContainerName("Filesystem @ 2026 #1")).toBe("filesystem-2026-1");
    });

    test("collapses multiple hyphens and trims leading/trailing hyphens", () => {
      expect(sanitizeContainerName("---test---server---")).toBe("test-server");
      expect(sanitizeContainerName("a---b__c")).toBe("a-b__c");
    });

    test("returns fallback 'sidecar' if name is empty or all special characters", () => {
      expect(sanitizeContainerName("!!!")).toBe("sidecar");
      expect(sanitizeContainerName("")).toBe("sidecar");
    });

    test("preserves valid Docker container name characters", () => {
      expect(sanitizeContainerName("my_server.v1.0-alpha")).toBe("my_server.v1.0-alpha");
    });
  });

  describe("generateContainerName", () => {
    const serverId = "4fdf9d6e-a1c3-4281-951d-6ed01f8a3db2";

    test("uses explicit config.name if provided", () => {
      const name = generateContainerName(serverId, { name: "custom-container" }, "Server Name");
      expect(name).toBe("mcp-sidecar-custom-container-4fdf9d6e");
    });

    test("uses serverName if no config.name is provided", () => {
      const name = generateContainerName(serverId, {}, "Filesystem Server");
      expect(name).toBe("mcp-sidecar-filesystem-server-4fdf9d6e");
    });

    test("infers name from image if no serverName or config.name", () => {
      const name = generateContainerName(
        serverId,
        { image: "ghcr.io/yctimlin/mcp_excalidraw:latest" }
      );
      expect(name).toBe("mcp-sidecar-excalidraw-4fdf9d6e");
    });

    test("infers name from command/args if no image, serverName, or config.name", () => {
      const name = generateContainerName(
        serverId,
        { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem"] }
      );
      expect(name).toBe("mcp-sidecar-filesystem-4fdf9d6e");
    });

    test("falls back to sidecar prefix and shortId when no context is available", () => {
      const name = generateContainerName(serverId, {});
      expect(name).toBe("mcp-sidecar-sidecar-4fdf9d6e");
    });
  });

  describe("StdioConfig env formatting", () => {
    test("formats env Record<string, string> into Docker Env array", () => {
      const config = {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-memory"],
        env: {
          API_KEY: "secret",
          PORT: "8080",
        },
      };

      const envArray = config.env
        ? Object.entries(config.env).map(([k, v]) => `${k}=${v}`)
        : [];

      expect(envArray).toEqual(["API_KEY=secret", "PORT=8080"]);
    });
  });

  describe("getDefaultSidecarImage", () => {
    test("returns ghcr.io/astral-sh/uv:python3.12-bookworm-slim for uvx, uv, python, and pip commands", () => {
      expect(getDefaultSidecarImage("uvx")).toBe("ghcr.io/astral-sh/uv:python3.12-bookworm-slim");
      expect(getDefaultSidecarImage("uv")).toBe("ghcr.io/astral-sh/uv:python3.12-bookworm-slim");
      expect(getDefaultSidecarImage("python")).toBe("ghcr.io/astral-sh/uv:python3.12-bookworm-slim");
      expect(getDefaultSidecarImage("pip")).toBe("ghcr.io/astral-sh/uv:python3.12-bookworm-slim");
      expect(getDefaultSidecarImage("python3")).toBe("ghcr.io/astral-sh/uv:python3.12-bookworm-slim");
    });

    test("returns node:22-alpine for npx and other non-python commands", () => {
      expect(getDefaultSidecarImage("npx")).toBe("node:22-alpine");
      expect(getDefaultSidecarImage("node")).toBe("node:22-alpine");
    });

    test("throws error if no command is provided", () => {
      expect(() => getDefaultSidecarImage(undefined)).toThrow();
    });
  });
});
