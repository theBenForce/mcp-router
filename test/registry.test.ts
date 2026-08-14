import { describe, expect, test, afterAll, beforeEach } from "bun:test";
import { RegistryService } from "../src/services/registry.service";
import type { RegistryServerEntry, RegistryServerDetail } from "../src/services/registry.service";

describe("RegistryService", () => {
  let registryService: RegistryService;

  beforeEach(() => {
    registryService = new RegistryService("https://registry.modelcontextprotocol.io");
  });

  test("sanitizes registry server name into valid router server name", () => {
    expect(registryService.sanitizeServerName("io.github.0Mattias/bettermemory")).toBe("bettermemory");
    expect(registryService.sanitizeServerName("agency.kesey/pretrip")).toBe("pretrip");
    expect(registryService.sanitizeServerName("@scoped/my-server")).toBe("my-server");
    expect(registryService.sanitizeServerName("simple-name")).toBe("simple-name");
  });

  test("converts npm package registry item to stdio configuration", () => {
    const server: RegistryServerDetail = {
      name: "agency.kesey/pretrip",
      title: "Pre-Trip compliance scanner",
      description: "Screen regulated-health marketing copy against source-cited rulesets",
      version: "1.0.1",
      websiteUrl: "https://scan.kesey.agency/developers/",
      packages: [
        {
          registryType: "npm",
          identifier: "pretrip-mcp",
          version: "1.0.1",
          transport: { type: "stdio" },
          environmentVariables: [
            {
              name: "PRETRIP_API_KEY",
              description: "API Key for Pretrip",
              isRequired: true,
              isSecret: true,
            },
          ],
        },
      ],
    };

    const options = registryService.getAvailableTransportOptions(server);
    expect(options.length).toBe(1);
    expect(options[0].transportType).toBe("stdio");
    expect(options[0].executorType).toBe("host");
    expect(options[0].config.command).toBe("npx");
    expect(options[0].config.args).toEqual(["-y", "pretrip-mcp@1.0.1"]);
    expect(options[0].envVars?.length).toBe(1);
    expect(options[0].envVars?.[0].name).toBe("PRETRIP_API_KEY");

    const createInput = registryService.convertRegistryServerToCreateInput(server, options[0], {
      PRETRIP_API_KEY: "secret_123",
    });

    expect(createInput.name).toBe("pretrip");
    expect(createInput.serverTitle).toBe("Pre-Trip compliance scanner");
    expect(createInput.serverVersion).toBe("1.0.1");
    expect(createInput.websiteUrl).toBe("https://scan.kesey.agency/developers/");
    expect(createInput.transportType).toBe("stdio");
    expect(createInput.config.command).toBe("npx");
    expect(createInput.config.args).toEqual(["-y", "pretrip-mcp@1.0.1"]);
    expect(createInput.config.env).toEqual({ PRETRIP_API_KEY: "secret_123" });
  });

  test("converts pypi package registry item to uvx configuration with package arguments", () => {
    const server: RegistryServerDetail = {
      name: "io.github.06ketan/medium-ops",
      title: "medium-ops",
      description: "Medium CLI + 23-tool MCP server",
      version: "0.1.2",
      packages: [
        {
          registryType: "pypi",
          identifier: "medium-ops",
          version: "0.1.2",
          runtimeHint: "uvx",
          transport: { type: "stdio" },
          packageArguments: [
            { value: "mcp", type: "positional" },
            { value: "serve", type: "positional" },
          ],
        },
      ],
    };

    const options = registryService.getAvailableTransportOptions(server);
    expect(options.length).toBe(1);
    expect(options[0].transportType).toBe("stdio");
    expect(options[0].config.command).toBe("uvx");
    expect(options[0].config.args).toEqual(["medium-ops", "mcp", "serve"]);

    const createInput = registryService.convertRegistryServerToCreateInput(server, options[0]);
    expect(createInput.name).toBe("medium-ops");
    expect(createInput.config.command).toBe("uvx");
    expect(createInput.config.args).toEqual(["medium-ops", "mcp", "serve"]);
  });

  test("converts remote streamable-http and SSE registry items", () => {
    const server: RegistryServerDetail = {
      name: "ac.inference.sh/mcp",
      title: "inference.sh",
      description: "Run 150+ AI apps",
      version: "2.0.1",
      remotes: [
        {
          type: "streamable-http",
          url: "https://api.inference.sh/mcp",
          headers: [
            {
              name: "Authorization",
              description: "Bearer token",
              isRequired: true,
              isSecret: true,
            },
          ],
        },
        {
          type: "sse",
          url: "https://api.inference.sh/sse",
        },
      ],
    };

    const options = registryService.getAvailableTransportOptions(server);
    expect(options.length).toBe(2);
    expect(options[0].transportType).toBe("streamable-http");
    expect(options[0].config.url).toBe("https://api.inference.sh/mcp");
    expect(options[0].authType).toBe("bearer");

    expect(options[1].transportType).toBe("sse");
    expect(options[1].config.url).toBe("https://api.inference.sh/sse");
    expect(options[1].authType).toBe("none");

    const createInput = registryService.convertRegistryServerToCreateInput(server, options[0], {}, {
      token: "inf_token_abc",
    });

    expect(createInput.name).toBe("mcp");
    expect(createInput.transportType).toBe("streamable-http");
    expect(createInput.config.url).toBe("https://api.inference.sh/mcp");
    expect(createInput.authType).toBe("bearer");
    expect(createInput.authData).toEqual({ token: "inf_token_abc" });
  });

  test("converts OCI docker package registry item", () => {
    const server: RegistryServerDetail = {
      name: "com.mcparmory/github",
      description: "Manage repositories and automate GitHub workflows",
      version: "1.0.6",
      packages: [
        {
          registryType: "oci",
          identifier: "ghcr.io/mcparmory/github:1.0.6",
          runtimeHint: "docker",
          transport: { type: "stdio" },
        },
      ],
    };

    const options = registryService.getAvailableTransportOptions(server);
    expect(options.length).toBe(1);
    expect(options[0].transportType).toBe("docker");
    expect(options[0].executorType).toBe("docker");
    expect(options[0].config.image).toBe("ghcr.io/mcparmory/github:1.0.6");
  });

  test("caches and returns live servers list from official registry API", async () => {
    const result = await registryService.listServers({ limit: 5, search: "tandem" });
    expect(result).toBeDefined();
    expect(Array.isArray(result.servers)).toBe(true);
    expect(result.servers.length).toBeGreaterThan(0);

    const match = result.servers.find((s) => s.server.name.includes("tandem"));
    expect(match).toBeDefined();
    expect(match?.server.name).toContain("tandem");

    // Second call should hit the cache
    const cachedResult = await registryService.listServers({ limit: 5, search: "tandem" });
    expect(cachedResult).toEqual(result);
  });

  test("GET /api/registry/servers returns servers from registry endpoint", async () => {
    const { default: app } = await import("../src/index");
    const res = await app.fetch(new Request("http://localhost/api/registry/servers?limit=3"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.servers).toBeDefined();
    expect(Array.isArray(data.servers)).toBe(true);
    expect(data.servers.length).toBeGreaterThan(0);
  });

  test("POST /api/registry/install creates a server directly from registry item", async () => {
    const { default: app } = await import("../src/index");
    const testRegistryServer = {
      name: `test-org/direct-install-${crypto.randomUUID().slice(0, 8)}`,
      title: "Direct Install Registry Server",
      description: "Installed directly via /api/registry/install",
      version: "1.0.0",
      remotes: [
        {
          type: "streamable-http",
          url: "https://example.com/direct-mcp",
        },
      ],
    };

    const res = await app.fetch(
      new Request("http://localhost/api/registry/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          server: testRegistryServer,
        }),
      })
    );

    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.id).toBeDefined();
    expect(created.server_title).toBe("Direct Install Registry Server");
    expect(created.transport_type).toBe("streamable-http");
    expect(created.config.url).toBe("https://example.com/direct-mcp");
  });
});
