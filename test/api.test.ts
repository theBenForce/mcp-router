import { describe, expect, test, afterAll } from "bun:test";
import app from "../src/index";
import { closeDb } from "../src/db";

describe("Healthcheck endpoint", () => {
  afterAll(() => {
    closeDb();
  });

  test("GET /health returns 200 OK with status ok", async () => {
    const res = await app.fetch(new Request("http://localhost/health"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
  });
});
