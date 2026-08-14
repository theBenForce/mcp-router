import type { CreateServerInput } from "./server.service";

export interface RegistryIcon {
  src: string;
  mimeType?: string;
  sizes?: string[];
  theme?: "light" | "dark";
}

export interface RegistryRepository {
  url: string;
  source: string;
  id?: string;
  subfolder?: string;
}

export interface RegistryHeader {
  name: string;
  description?: string;
  isRequired?: boolean;
  isSecret?: boolean;
  value?: string;
  default?: string;
}

export interface RegistryRemote {
  type: "streamable-http" | "sse" | "http" | string;
  url: string;
  headers?: RegistryHeader[];
}

export interface RegistryEnvVar {
  name: string;
  description?: string;
  isRequired?: boolean;
  isSecret?: boolean;
  format?: string;
  default?: string;
}

export interface RegistryPackageArgument {
  type?: "positional" | "named";
  name?: string;
  value?: string;
  description?: string;
  isRequired?: boolean;
  default?: string;
}

export interface RegistryPackage {
  registryType: "npm" | "pypi" | "oci" | string;
  identifier: string;
  version?: string;
  registryBaseUrl?: string;
  runtimeHint?: string;
  transport?: {
    type: "stdio" | string;
  };
  packageArguments?: RegistryPackageArgument[];
  environmentVariables?: RegistryEnvVar[];
}

export interface RegistryServerDetail {
  $schema?: string;
  name: string;
  title?: string;
  description?: string;
  version?: string;
  websiteUrl?: string;
  repository?: RegistryRepository;
  icons?: RegistryIcon[];
  remotes?: RegistryRemote[];
  packages?: RegistryPackage[];
  instructions?: string;
}

export interface RegistryServerEntry {
  server: RegistryServerDetail;
  _meta?: {
    "io.modelcontextprotocol.registry/official"?: {
      status?: "active" | "deprecated" | string;
      statusChangedAt?: string;
      publishedAt?: string;
      updatedAt?: string;
      isLatest?: boolean;
    };
    "io.modelcontextprotocol.registry/publisher-provided"?: Record<string, any>;
  };
}

export interface RegistryListResponse {
  servers: RegistryServerEntry[];
  metadata?: {
    nextCursor?: string;
    count?: number;
  };
}

export interface RegistryParsedOption {
  id: string;
  label: string;
  transportType: "streamable-http" | "sse" | "stdio" | "docker";
  executorType: "host" | "docker";
  config: Record<string, any>;
  authType: "none" | "bearer" | "api_key" | "oauth2" | "cli_command";
  authData?: Record<string, any>;
  envVars?: RegistryEnvVar[];
  headers?: RegistryHeader[];
}

export interface ListServersParams {
  search?: string;
  cursor?: string;
  limit?: number;
  version?: string;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class RegistryService {
  private baseUrl: string;
  private cache: Map<string, CacheEntry<any>> = new Map();
  private defaultTtlMs = 5 * 60 * 1000; // 5 minutes

  constructor(baseUrl = "https://registry.modelcontextprotocol.io") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  /**
   * Sanitizes a registry identifier (e.g., 'agency.kesey/pretrip') into a friendly,
   * unique server name for the local configuration.
   */
  sanitizeServerName(registryName: string): string {
    if (!registryName) return "mcp-server";
    const parts = registryName.split("/").filter(Boolean);
    const lastPart = parts[parts.length - 1] || registryName;
    const clean = lastPart
      .replace(/^@/, "")
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    return clean || "mcp-server";
  }

  /**
   * Lists servers from the official MCP registry with support for search, pagination,
   * and caching.
   */
  async listServers(params: ListServersParams = {}): Promise<RegistryListResponse> {
    const url = new URL(`${this.baseUrl}/v0.1/servers`);

    if (params.search && params.search.trim()) {
      url.searchParams.set("search", params.search.trim());
    }
    if (params.cursor) {
      url.searchParams.set("cursor", params.cursor);
    }
    if (params.limit) {
      url.searchParams.set("limit", String(params.limit));
    }
    // Default to version=latest so users see unique latest packages unless specified
    if (params.version) {
      url.searchParams.set("version", params.version);
    } else {
      url.searchParams.set("version", "latest");
    }

    const cacheKey = url.toString();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "mcp-router/1.0",
      },
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(`Official MCP Registry API returned status ${res.status}: ${errorText || res.statusText}`);
    }

    const data = (await res.json()) as RegistryListResponse;

    this.cache.set(cacheKey, {
      data,
      expiresAt: Date.now() + this.defaultTtlMs,
    });

    return data;
  }

  /**
   * Retrieves detailed metadata for a specific server and version.
   */
  async getServerVersion(serverName: string, version = "latest"): Promise<RegistryServerEntry> {
    const encodedName = encodeURIComponent(serverName);
    const encodedVersion = encodeURIComponent(version);
    const url = `${this.baseUrl}/v0.1/servers/${encodedName}/versions/${encodedVersion}`;

    const cached = this.cache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "mcp-router/1.0",
      },
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(`Official MCP Registry returned status ${res.status}: ${errorText || res.statusText}`);
    }

    const data = (await res.json()) as RegistryServerEntry;

    this.cache.set(url, {
      data,
      expiresAt: Date.now() + this.defaultTtlMs,
    });

    return data;
  }

  /**
   * Parses all available transport and package options for an MCP server from the registry.
   */
  getAvailableTransportOptions(server: RegistryServerDetail): RegistryParsedOption[] {
    const options: RegistryParsedOption[] = [];

    // 1. Process Remotes (Streamable HTTP / SSE)
    if (Array.isArray(server.remotes)) {
      server.remotes.forEach((remote, index) => {
        const isHttp = remote.type === "streamable-http" || remote.type === "http";
        const transportType = isHttp ? "streamable-http" : "sse";
        const label = isHttp
          ? `Remote (${server.title || server.name} - Streamable HTTP)`
          : `Remote (${server.title || server.name} - SSE)`;

        let authType: "none" | "bearer" | "api_key" | "oauth2" | "cli_command" = "none";
        const headers = remote.headers || [];

        // Detect auth header pattern
        const authHeader = headers.find((h) => h.name.toLowerCase() === "authorization");
        if (authHeader) {
          authType = "bearer";
        } else if (headers.some((h) => /api[-_]?key|token/i.test(h.name))) {
          authType = "api_key";
        }

        options.push({
          id: `remote-${index}`,
          label,
          transportType,
          executorType: "host",
          config: {
            url: remote.url,
          },
          authType,
          headers,
        });
      });
    }

    // 2. Process Packages (NPM, PyPI, OCI Docker)
    if (Array.isArray(server.packages)) {
      server.packages.forEach((pkg, index) => {
        const regType = (pkg.registryType || "").toLowerCase();
        const positionalArgs = (pkg.packageArguments || [])
          .filter((a) => (a.type || "positional") === "positional" && a.value)
          .map((a) => a.value as string);

        if (regType === "npm") {
          const command = pkg.runtimeHint || "npx";
          const packageSpec = pkg.version ? `${pkg.identifier}@${pkg.version}` : pkg.identifier;
          const args = ["-y", packageSpec, ...positionalArgs];

          options.push({
            id: `package-${index}-npm`,
            label: `Node.js Package (npm / ${command})`,
            transportType: "stdio",
            executorType: "host",
            config: {
              command,
              args,
            },
            authType: "none",
            envVars: pkg.environmentVariables || [],
          });
        } else if (regType === "pypi") {
          const command = pkg.runtimeHint || "uvx";
          const packageSpec = pkg.identifier;
          const args = [packageSpec, ...positionalArgs];

          options.push({
            id: `package-${index}-pypi`,
            label: `Python Package (PyPI / ${command})`,
            transportType: "stdio",
            executorType: "host",
            config: {
              command,
              args,
            },
            authType: "none",
            envVars: pkg.environmentVariables || [],
          });
        } else if (regType === "oci" || pkg.runtimeHint === "docker") {
          options.push({
            id: `package-${index}-oci`,
            label: `Docker Container (${pkg.identifier})`,
            transportType: "docker",
            executorType: "docker",
            config: {
              image: pkg.identifier,
            },
            authType: "none",
            envVars: pkg.environmentVariables || [],
          });
        } else {
          // Fallback stdio package
          const command = pkg.runtimeHint || "npx";
          const args = [pkg.identifier, ...positionalArgs];

          options.push({
            id: `package-${index}-stdio`,
            label: `Stdio Package (${pkg.identifier})`,
            transportType: "stdio",
            executorType: "host",
            config: {
              command,
              args,
            },
            authType: "none",
            envVars: pkg.environmentVariables || [],
          });
        }
      });
    }

    return options;
  }

  /**
   * Translates a registry server and selected transport option into a CreateServerInput
   * ready for insertion into the database and server connection.
   */
  convertRegistryServerToCreateInput(
    server: RegistryServerDetail,
    option?: RegistryParsedOption,
    envValues?: Record<string, string>,
    authData?: Record<string, any>,
    customName?: string
  ): CreateServerInput {
    const availableOptions = this.getAvailableTransportOptions(server);
    const selectedOption = option || availableOptions[0];

    if (!selectedOption) {
      throw new Error(`No transport or package options available for registry server '${server.name}'`);
    }

    const name = customName?.trim() || this.sanitizeServerName(server.name);
    const description = server.description || "";
    const serverTitle = server.title || undefined;
    const serverVersion = server.version || undefined;
    const websiteUrl = server.websiteUrl || server.repository?.url || undefined;
    const iconsJson = server.icons && server.icons.length > 0 ? JSON.stringify(server.icons) : undefined;
    const instructions = server.instructions || undefined;

    const baseConfig = { ...selectedOption.config };

    // Attach environment variables for stdio/docker transports if provided
    if (envValues && Object.keys(envValues).length > 0) {
      baseConfig.env = {
        ...(baseConfig.env || {}),
        ...envValues,
      };
    }

    return {
      name,
      description,
      serverTitle,
      serverVersion,
      websiteUrl,
      iconsJson,
      instructions,
      transportType: selectedOption.transportType,
      executorType: selectedOption.executorType,
      config: baseConfig,
      authType: selectedOption.authType || "none",
      authData: authData || selectedOption.authData || {},
    };
  }
}

export const registryService = new RegistryService();
