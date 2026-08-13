import { describe, expect, test, afterAll } from "bun:test";
import app from "../src/index";
import { closeDb } from "../src/db";

describe("Static SPA Serving", () => {
  afterAll(() => {
    closeDb();
  });

  test("GET / returns 200 OK with HTML content", async () => {
    const res = await app.fetch(new Request("http://localhost/"));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("<title>MCP Router");
  });

  test("GET /app-icon.svg returns 200 OK with SVG content", async () => {
    const res = await app.fetch(new Request("http://localhost/app-icon.svg"));
    expect(res.status).toBe(200);
    const contentType = res.headers.get("Content-Type");
    expect(contentType).toContain("image/svg+xml");
  });
});
