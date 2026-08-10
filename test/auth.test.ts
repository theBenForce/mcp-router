import { describe, expect, test } from "bun:test";
import {
  createAuthProvider,
  NoAuthProvider,
  BearerAuthProvider,
  ApiKeyAuthProvider,
} from "../src/mcp/upstream/auth";

describe("AuthProvider Strategy", () => {
  test("creates NoAuthProvider for authType 'none'", async () => {
    const provider = createAuthProvider("none");
    expect(provider).toBeInstanceOf(NoAuthProvider);
    expect(await provider.getHeaders()).toEqual({});
  });

  test("creates BearerAuthProvider for authType 'bearer'", async () => {
    const provider = createAuthProvider("bearer", JSON.stringify({ token: "my-secret-token" }));
    expect(provider).toBeInstanceOf(BearerAuthProvider);
    expect(await provider.getHeaders()).toEqual({ Authorization: "Bearer my-secret-token" });
  });

  test("creates ApiKeyAuthProvider for authType 'api_key'", async () => {
    const provider = createAuthProvider(
      "api_key",
      JSON.stringify({ apiKey: "key-12345", headerName: "X-Custom-Auth" })
    );
    expect(provider).toBeInstanceOf(ApiKeyAuthProvider);
    expect(await provider.getHeaders()).toEqual({ "X-Custom-Auth": "key-12345" });
  });

  test("creates OAuth2AuthProvider for authType 'oauth2'", async () => {
    const provider = createAuthProvider("oauth2", null, "server-123");
    expect(provider.type).toBe("oauth2");
  });
});
