import { describe, expect, test, afterAll, beforeEach } from "bun:test";
import app from "../src/index";
import { keyService } from "../src/services/key.service";
import { promptService } from "../src/services/prompt.service";
import { getRawDb, closeDb } from "../src/db";

describe("MCP Prompts & Permissions", () => {
  beforeEach(() => {
    const rawDb = getRawDb();
    rawDb.query("DELETE FROM mcp_prompt_arguments").run();
    rawDb.query("DELETE FROM mcp_prompts").run();
  });

  afterAll(() => {
    closeDb();
  });

  test("REST API: CRUD operations for prompts", async () => {
    // 1. Create Prompt via REST API
    const createRes = await app.fetch(
      new Request("http://localhost/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "code_review",
          title: "Request Code Review",
          description: "Asks LLM to review code quality",
          contentTemplate: "Review this {{language}} code:\n{{code}}",
          arguments: [
            { name: "language", description: "Language name", required: true },
            { name: "code", description: "Code snippet", required: true },
          ],
        }),
      })
    );

    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.id).toBeDefined();
    expect(created.name).toBe("code_review");
    expect(created.arguments.length).toBe(2);

    // 2. List Prompts
    const listRes = await app.fetch(new Request("http://localhost/api/prompts"));
    expect(listRes.status).toBe(200);
    const list = await listRes.json();
    expect(list.some((p: any) => p.name === "code_review")).toBe(true);

    // 3. Get Prompt by ID
    const getRes = await app.fetch(new Request(`http://localhost/api/prompts/${created.id}`));
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.name).toBe("code_review");

    // 4. Update Prompt
    const updateRes = await app.fetch(
      new Request(`http://localhost/api/prompts/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Updated Code Review",
        }),
      })
    );
    expect(updateRes.status).toBe(200);
    const updated = await updateRes.json();
    expect(updated.title).toBe("Updated Code Review");
  });

  test("JSON-RPC prompts/list and prompts/get with permissions", async () => {
    // Create prompt directly via service
    const prompt = promptService.createPrompt({
      name: "summarize_text",
      title: "Summarize Text",
      description: "Summarizes provided text",
      contentTemplate: "Please summarize: {{text}}",
      arguments: [{ name: "text", description: "Input text", required: true }],
    });

    // Create key WITH permission to this prompt
    const keyWithPerm = keyService.createKey({
      name: "Prompt User",
      permissions: [{ promptId: prompt!.id }],
    });

    // Create key WITHOUT permission to this prompt
    const keyNoPerm = keyService.createKey({
      name: "Unprivileged Key",
      permissions: [],
    });

    // Test prompts/list for key WITH permission
    const listRes = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${keyWithPerm.secretKey}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "prompts/list" }),
      })
    );
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.result).toBeDefined();
    expect(listBody.result.prompts.some((p: any) => p.name === "summarize_text")).toBe(true);

    // Test prompts/list for key WITHOUT permission
    const listNoPermRes = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${keyNoPerm.secretKey}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "prompts/list" }),
      })
    );
    expect(listNoPermRes.status).toBe(200);
    const listNoPermBody = await listNoPermRes.json();
    expect(listNoPermBody.result.prompts.some((p: any) => p.name === "summarize_text")).toBe(false);

    // Test prompts/get for key WITH permission
    const getRes = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${keyWithPerm.secretKey}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "prompts/get",
          params: {
            name: "summarize_text",
            arguments: { text: "Hello World MCP" },
          },
        }),
      })
    );
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.result).toBeDefined();
    expect(getBody.result.messages[0].content.text).toBe("Please summarize: Hello World MCP");

    // Test prompts/get for key WITHOUT permission -> Error -32001
    const getNoPermRes = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${keyNoPerm.secretKey}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 4,
          method: "prompts/get",
          params: {
            name: "summarize_text",
            arguments: { text: "Hello World MCP" },
          },
        }),
      })
    );
    expect(getNoPermRes.status).toBe(200);
    const getNoPermBody = await getNoPermRes.json();
    expect(getNoPermBody.error).toBeDefined();
    expect(getNoPermBody.error.code).toBe(-32001);

    // Test prompts/get with missing required argument -> Error -32602
    const getMissingArgRes = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${keyWithPerm.secretKey}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 5,
          method: "prompts/get",
          params: {
            name: "summarize_text",
            arguments: {},
          },
        }),
      })
    );
    expect(getMissingArgRes.status).toBe(200);
    const getMissingArgBody = await getMissingArgRes.json();
    expect(getMissingArgBody.error).toBeDefined();
    expect(getMissingArgBody.error.code).toBe(-32602);
  });
});
