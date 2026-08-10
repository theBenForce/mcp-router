---
status: "accepted"
date: 2026-08-10
---

# User-Defined MCP Prompts and Granular Prompt Permissions

## Context and Problem Statement

The Model Context Protocol (MCP) specification defines Prompts (`prompts/list` and `prompts/get`) alongside Tools and Resources. Prompts allow client applications (LLMs) to retrieve structured system prompts, templates, and contextual workflows. Previously, MCP Router supported upstream server discovery and downstream tool permission filtering, but lacked support for hosting and controlling access to MCP Prompts.

Downstream clients need a unified proxy endpoint to discover and render prompts, while administrators need fine-grained control to grant API keys access to specific prompts.

## Decision Drivers

* Must implement standard MCP specification for `prompts/list` and `prompts/get` over downstream JSON-RPC channels.
* Must support parameterized prompt templates with argument validation.
* Must integrate seamlessly with existing API key permission matrix without breaking tool or server permissions.
* Must provide management APIs (REST) and UI components for managing prompt templates and permission assignments.

## Considered Options

* **Option 1: Upstream Prompt Forwarding Only** — Relay prompt requests to upstream servers. (Rejected: Upstream stdio/docker sidecars might not support prompts or users may want custom central prompt templates independent of upstream servers).
* **Option 2: Central User-Defined Prompts with API Key Permission Matrix Integration** — Store prompt templates in SQLite, validate/render using Mustache, and extend `api_key_permissions` table with a `prompt_id` column.

## Decision Outcome

Chosen option: "Option 2: Central User-Defined Prompts with API Key Permission Matrix Integration", because it gives administrators complete control over prompt templates and allows granting per-key permissions for specific prompts.

### Technical Details

1. **Schema Extension**: Created `mcp_prompts` and `mcp_prompt_arguments` tables. Extended `api_key_permissions` table with a `prompt_id` column and updated the UNIQUE constraint to `UNIQUE(api_key_id, server_id, tool_id, prompt_id)`.
2. **Template Rendering**: Uses `Mustache` for standard template interpolation (`Mustache.render(content_template, args)`).
3. **Downstream JSON-RPC Protocol**:
   - `prompts/list`: Returns user-defined prompts filtered by the active API key's allowed `prompt_id` set (or all prompts if the key has wildcard/full access).
   - `prompts/get`: Validates required arguments, checks key permission for the target prompt name, and renders the prompt message array.
4. **REST API & Frontend**: Created `/api/prompts` endpoints and added a Prompts tab in the Dashboard UI along with prompt selection checkboxes in the API Key Permission Matrix modal.

### Consequences

* Good, because downstream LLM clients can leverage standardized prompt templates via the same MCP proxy endpoint.
* Good, because prompt access is governed by the same role-based API key permission model as tools and servers.
* Good, because automatic SQLite schema migration preserves existing database installations.
* Bad, because prompt arguments currently support simple string substitution rather than nested complex JSON schema arguments.

## More Information

* Database Schema: `src/db/schema.ts` (`mcpPrompts`, `mcpPromptArguments`, `apiKeyPermissions`)
* Service Logic: `src/services/prompt.service.ts`
* Downstream Protocol Handling: `src/mcp/downstream/handler.ts` & `src/mcp/downstream/filter.ts`
* REST Controller: `src/api/prompts.controller.ts`
