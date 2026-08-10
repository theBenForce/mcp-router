import path from "node:path";

export const config = {
  port: parseInt(process.env.PORT || "5170", 10),
  host: process.env.HOST || "0.0.0.0",
  databasePath: process.env.DATABASE_PATH || path.join(process.cwd(), "data", "mcp_router.db"),
  publicDir: process.env.PUBLIC_DIR || path.join(process.cwd(), "public"),
  isDev: process.env.NODE_ENV !== "production",
};
