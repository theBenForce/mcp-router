export type ActionType = "read" | "write" | "delete" | "execute";

const DELETE_VERBS = [
  "delete", "remove", "drop", "destroy", "clear", "purge", 
  "cancel", "archive", "unlink", "trash", "uninstall", "erase"
];

const EXECUTE_VERBS = [
  "execute", "run", "call", "start", "stop", "restart", 
  "trigger", "invoke", "build", "deploy", "cmd", "eval", "shell", "exec"
];

const READ_VERBS = [
  "get", "read", "list", "search", "fetch", "view", "query", 
  "find", "inspect", "show", "count", "check", "describe", 
  "export", "cat", "info", "status", "health", "load"
];

const WRITE_VERBS = [
  "create", "add", "insert", "post", "write", "update", "edit", 
  "patch", "put", "set", "modify", "change", "rename", "upsert", 
  "save", "import", "upload", "assign", "tag", "append"
];

/**
 * Classifies an MCP tool into 'read', 'write', 'delete', or 'execute'
 * based on heuristics matching tool name and description.
 */
export function classifyToolAction(toolName: string, description: string = ""): ActionType {
  // Extract words/tokens from tool name (handling camelCase, PascalCase, snake_case, kebab-case)
  const tokens = toolName
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/);

  // Check prefix / first token or token matches
  for (const token of tokens) {
    if (DELETE_VERBS.includes(token)) return "delete";
    if (EXECUTE_VERBS.includes(token)) return "execute";
    if (READ_VERBS.includes(token)) return "read";
    if (WRITE_VERBS.includes(token)) return "write";
  }

  // Fallback to searching description for strong action signals
  const normDesc = description.toLowerCase();
  for (const verb of DELETE_VERBS) {
    if (normDesc.includes(`${verb} `) || normDesc.includes(` ${verb}`)) return "delete";
  }
  for (const verb of EXECUTE_VERBS) {
    if (normDesc.includes(`${verb} `) || normDesc.includes(` ${verb}`)) return "execute";
  }
  for (const verb of READ_VERBS) {
    if (normDesc.includes(`${verb} `) || normDesc.includes(` ${verb}`)) return "read";
  }
  for (const verb of WRITE_VERBS) {
    if (normDesc.includes(`${verb} `) || normDesc.includes(` ${verb}`)) return "write";
  }

  // Default fallback if no verb matched
  return "write";
}
