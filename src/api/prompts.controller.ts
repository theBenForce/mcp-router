import { Hono } from "hono";
import { promptService } from "../services/prompt.service";

const app = new Hono();

// List all prompts
app.get("/", (c) => {
  const prompts = promptService.listPrompts();
  return c.json(prompts);
});

// Create a prompt
app.post("/", async (c) => {
  try {
    const body = await c.req.json();
    if (!body.name || !body.contentTemplate) {
      return c.json({ error: "Missing required fields: name, contentTemplate" }, 400);
    }
    const existing = promptService.getPromptByName(body.name);
    if (existing) {
      return c.json({ error: `Prompt with name '${body.name}' already exists` }, 400);
    }
    const prompt = promptService.createPrompt(body);
    return c.json(prompt, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Get prompt by ID
app.get("/:id", (c) => {
  const id = c.req.param("id");
  const prompt = promptService.getPrompt(id);
  if (!prompt) {
    return c.json({ error: "Prompt not found" }, 404);
  }
  return c.json(prompt);
});

// Update prompt
app.put("/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const body = await c.req.json();
    const prompt = promptService.updatePrompt(id, body);
    if (!prompt) {
      return c.json({ error: "Prompt not found" }, 404);
    }
    return c.json(prompt);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Delete prompt
app.delete("/:id", (c) => {
  const id = c.req.param("id");
  promptService.deletePrompt(id);
  return c.json({ success: true });
});

export default app;
