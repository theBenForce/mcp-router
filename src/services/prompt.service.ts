import Mustache from "mustache";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { mcpPrompts, mcpPromptArguments } from "../db/schema";

export interface PromptArgumentInput {
  name: string;
  description?: string;
  required?: boolean;
}

export interface CreatePromptInput {
  name: string;
  title?: string;
  description?: string;
  contentTemplate: string;
  arguments?: PromptArgumentInput[];
}

export interface UpdatePromptInput {
  name?: string;
  title?: string;
  description?: string;
  contentTemplate?: string;
  arguments?: PromptArgumentInput[];
}

export class PromptService {
  listPrompts() {
    const db = getDb();
    const prompts = db
      .select({
        id: mcpPrompts.id,
        name: mcpPrompts.name,
        title: mcpPrompts.title,
        description: mcpPrompts.description,
        content_template: mcpPrompts.contentTemplate,
        created_at: mcpPrompts.createdAt,
        updated_at: mcpPrompts.updatedAt,
      })
      .from(mcpPrompts)
      .orderBy(sql`${mcpPrompts.createdAt} DESC`)
      .all();

    const args = db
      .select({
        id: mcpPromptArguments.id,
        prompt_id: mcpPromptArguments.promptId,
        name: mcpPromptArguments.name,
        description: mcpPromptArguments.description,
        required: mcpPromptArguments.required,
      })
      .from(mcpPromptArguments)
      .all();

    const argsMap = new Map<string, Array<{ name: string; description: string; required: boolean }>>();
    for (const arg of args) {
      if (!argsMap.has(arg.prompt_id)) {
        argsMap.set(arg.prompt_id, []);
      }
      argsMap.get(arg.prompt_id)!.push({
        name: arg.name,
        description: arg.description || "",
        required: Boolean(arg.required),
      });
    }

    return prompts.map((p) => ({
      ...p,
      arguments: argsMap.get(p.id) || [],
    }));
  }

  getPrompt(id: string) {
    const db = getDb();
    const prompt = db
      .select({
        id: mcpPrompts.id,
        name: mcpPrompts.name,
        title: mcpPrompts.title,
        description: mcpPrompts.description,
        content_template: mcpPrompts.contentTemplate,
        created_at: mcpPrompts.createdAt,
        updated_at: mcpPrompts.updatedAt,
      })
      .from(mcpPrompts)
      .where(eq(mcpPrompts.id, id))
      .get();

    if (!prompt) return null;

    const args = db
      .select({
        name: mcpPromptArguments.name,
        description: mcpPromptArguments.description,
        required: mcpPromptArguments.required,
      })
      .from(mcpPromptArguments)
      .where(eq(mcpPromptArguments.promptId, id))
      .all();

    return {
      ...prompt,
      arguments: args.map((a) => ({
        name: a.name,
        description: a.description || "",
        required: Boolean(a.required),
      })),
    };
  }

  getPromptByName(name: string) {
    const db = getDb();
    const prompt = db
      .select({
        id: mcpPrompts.id,
        name: mcpPrompts.name,
        title: mcpPrompts.title,
        description: mcpPrompts.description,
        content_template: mcpPrompts.contentTemplate,
        created_at: mcpPrompts.createdAt,
        updated_at: mcpPrompts.updatedAt,
      })
      .from(mcpPrompts)
      .where(eq(mcpPrompts.name, name))
      .get();

    if (!prompt) return null;

    const args = db
      .select({
        name: mcpPromptArguments.name,
        description: mcpPromptArguments.description,
        required: mcpPromptArguments.required,
      })
      .from(mcpPromptArguments)
      .where(eq(mcpPromptArguments.promptId, prompt.id))
      .all();

    return {
      ...prompt,
      arguments: args.map((a) => ({
        name: a.name,
        description: a.description || "",
        required: Boolean(a.required),
      })),
    };
  }

  createPrompt(input: CreatePromptInput) {
    const db = getDb();
    const id = crypto.randomUUID();

    db.insert(mcpPrompts)
      .values({
        id,
        name: input.name,
        title: input.title || "",
        description: input.description || "",
        contentTemplate: input.contentTemplate,
      })
      .run();

    if (input.arguments && input.arguments.length > 0) {
      for (const arg of input.arguments) {
        db.insert(mcpPromptArguments)
          .values({
            id: crypto.randomUUID(),
            promptId: id,
            name: arg.name,
            description: arg.description || "",
            required: arg.required ? 1 : 0,
          })
          .run();
      }
    }

    return this.getPrompt(id);
  }

  updatePrompt(id: string, input: UpdatePromptInput) {
    const db = getDb();
    const existing = this.getPrompt(id);
    if (!existing) return null;

    const name = input.name ?? existing.name;
    const title = input.title ?? existing.title;
    const description = input.description ?? existing.description;
    const contentTemplate = input.contentTemplate ?? existing.content_template;

    db.update(mcpPrompts)
      .set({
        name,
        title,
        description,
        contentTemplate,
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(mcpPrompts.id, id))
      .run();

    if (input.arguments !== undefined) {
      db.delete(mcpPromptArguments)
        .where(eq(mcpPromptArguments.promptId, id))
        .run();

      for (const arg of input.arguments) {
        db.insert(mcpPromptArguments)
          .values({
            id: crypto.randomUUID(),
            promptId: id,
            name: arg.name,
            description: arg.description || "",
            required: arg.required ? 1 : 0,
          })
          .run();
      }
    }

    return this.getPrompt(id);
  }

  deletePrompt(id: string) {
    const db = getDb();
    db.delete(mcpPrompts).where(eq(mcpPrompts.id, id)).run();
    return true;
  }

  renderPrompt(name: string, args: Record<string, string> = {}) {
    const prompt = this.getPromptByName(name);
    if (!prompt) {
      throw new Error(`Prompt '${name}' not found`);
    }

    // Check required arguments
    for (const arg of prompt.arguments) {
      if (arg.required && (args[arg.name] === undefined || args[arg.name] === null || args[arg.name] === "")) {
        throw new Error(`Missing required argument '${arg.name}' for prompt '${name}'`);
      }
    }

    // Render Mustache template
    const renderedText = Mustache.render(prompt.content_template, args);

    return {
      description: prompt.description || prompt.title || prompt.name,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: renderedText,
          },
        },
      ],
    };
  }
}

export const promptService = new PromptService();
