---
status: "accepted"
date: 2026-08-10
---

# Migrate from Raw SQL to Drizzle ORM

## Context and Problem Statement

The MCP Router backend manages five SQLite tables (`mcp_servers`, `mcp_tools`, `api_keys`, `api_key_permissions`, `audit_logs`) using raw SQL strings via `bun:sqlite`. Adding the new `docker` transport type required altering the `mcp_servers` table's CHECK constraint, which revealed fragility in the raw SQL schema management approach: there were no migrations, the schema lived in a standalone `.sql` file disconnected from the TypeScript types, and every query was a hand-written SQL string with no compile-time safety.

We needed a lightweight ORM that could handle schema evolution (migrations), provide type-safe queries, and work well with `bun:sqlite` — without adding the overhead of a heavyweight framework like Prisma.

## Decision Drivers

* Type safety — queries should be checked at compile time against the schema
* Lightweight — minimal runtime overhead, no binary engine (unlike Prisma)
* Schema-as-code — TypeScript schema definition instead of raw `.sql` files
* Migration support — both push-based (dev) and migration-file-based (production) schema evolution
* Compatibility with `bun:sqlite` — first-class support, not a workaround

## Considered Options

* Drizzle ORM — TypeScript-first, lightweight, works with `bun:sqlite`, push-based migrations
* Prisma — Popular, full-featured, but requires a binary engine, heavy for this use case
* Kysely — Lightweight SQL query builder, but less mature migration story
* Raw SQL (status quo) — No dependencies, but no type safety, no migrations, error-prone

## Decision Outcome

Chosen option: "Drizzle ORM", because it provides a TypeScript-native schema definition, type-safe query builder, and `drizzle-kit` for migrations — all without a binary engine or heavy runtime. Its `pushSchema` function handles runtime table creation and in-place schema evolution, which is ideal for a local tool that needs to gracefully handle database upgrades.

### Consequences

* Good, because schema is defined once in TypeScript (`src/db/schema.ts`) and used for both queries and migrations
* Good, because `drizzle-kit` supports both `push` (dev) and `generate`/`migrate` (production) workflows
* Good, because queries are type-checked — column name typos and type mismatches are caught at compile time
* Good, because `pushSchema` at startup handles table creation and constraint evolution transparently
* Bad, because all existing service files needed rewriting (one-time migration cost)
* Bad, because some complex dynamic queries (e.g., audit log filtering with optional WHERE clauses) are more verbose in Drizzle than raw SQL, requiring a `getRawDb()` escape hatch

## More Information

* Schema definition: `src/db/schema.ts`
* Database initialization with push: `src/db/index.ts`
* Drizzle Kit config: `drizzle.config.ts`
* The `pushSchema` function includes a migration path that recreates the `mcp_servers` table if the existing CHECK constraint doesn't include `'docker'`, preserving existing data
