import { describe, expect, test } from "bun:test";
import { config } from "../src/config";
import { getSessionCookieOptions } from "../src/api/auth.controller";
import { SidecarManager } from "../src/mcp/upstream/sidecar";
import { app } from "../src/index";

describe("Security Hardening Features", () => {
  describe("Config & Session Secret Hardening", () => {
    test("sessionSecret is initialized with a non-empty value", () => {
      expect(config.sessionSecret).toBeDefined();
      expect(typeof config.sessionSecret).toBe("string");
      expect(config.sessionSecret.length).toBeGreaterThanOrEqual(16);
    });

    test("authMode evaluates correctly for test environment", () => {
      expect(config.authMode).toBeDefined();
      expect(["docker", "desktop"]).toContain(config.authMode);
    });
  });

  describe("Cookie Security", () => {
    test("getSessionCookieOptions sets httpOnly and sameSite Lax", () => {
      const mockContext: any = {
        req: {
          header: () => undefined,
          url: "http://localhost:5170/api/auth/login",
        },
      };

      const opts = getSessionCookieOptions(mockContext);
      expect(opts.httpOnly).toBe(true);
      expect(opts.sameSite).toBe("Lax");
      expect(opts.path).toBe("/");
    });

    test("getSessionCookieOptions sets secure=true when x-forwarded-proto is https", () => {
      const mockContext: any = {
        req: {
          header: (name: string) => (name === "x-forwarded-proto" ? "https" : undefined),
          url: "http://localhost:5170/api/auth/login",
        },
      };

      const opts = getSessionCookieOptions(mockContext);
      expect(opts.secure).toBe(true);
    });
  });

  describe("Sidecar DOCKER_HOST Support", () => {
    test("SidecarManager parses tcp DOCKER_HOST correctly", () => {
      const origDockerHost = process.env.DOCKER_HOST;
      try {
        process.env.DOCKER_HOST = "tcp://docker-proxy:2375";
        const manager = new SidecarManager();
        expect((manager as any).host).toBe("docker-proxy");
        expect((manager as any).port).toBe(2375);
      } finally {
        if (origDockerHost) {
          process.env.DOCKER_HOST = origDockerHost;
        } else {
          delete process.env.DOCKER_HOST;
        }
      }
    });

    test("SidecarManager defaults to socket path when DOCKER_HOST is unix socket or unset", () => {
      const origDockerHost = process.env.DOCKER_HOST;
      try {
        delete process.env.DOCKER_HOST;
        const manager = new SidecarManager("/custom/docker.sock");
        expect((manager as any).socketPath).toBe("/custom/docker.sock");
      } finally {
        if (origDockerHost) {
          process.env.DOCKER_HOST = origDockerHost;
        } else {
          delete process.env.DOCKER_HOST;
        }
      }
    });
  });

  describe("CORS Protection Middleware", () => {
    test("health check returns 200 OK", async () => {
      const res = await app.request("/health");
      expect(res.status).toBe(200);
    });

    test("allows requests with local origin in dev/desktop mode", async () => {
      const res = await app.request("/health", {
        headers: {
          Origin: "http://localhost:5173",
        },
      });
      expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    });
  });

  describe("CLI Auth Shell Injection Safety", () => {
    test("runAuthCommand executes configured command without shell metacharacter expansion", async () => {
      const { serverService } = await import("../src/services/server.service");
      const created = await serverService.createServer({
        name: "security-auth-test-server",
        transportType: "stdio",
        config: { command: "node", args: ["-e", "console.log('test')"] },
        authType: "cli_command",
        authData: { command: "echo hello; echo injected" },
      });

      const res = await serverService.runAuthCommand(created!.id);
      expect(res.success).toBe(true);
      // Because shell-quote isolates operators like ';' out of string tokens,
      // it passes "hello", "echo", "injected" as literal arguments to echo instead of executing multiple shell statements
      expect(res.output).toBe("hello echo injected");

      await serverService.deleteServer(created!.id);
    });
  });
});
