---
status: "accepted"
date: 2026-08-10
---
# Use SQLite for Data Persistence

## Context and Problem Statement

The MCP Router needs to persist server configurations, discovered tools, API keys (hashed), permission matrices, and audit logs. The application runs as a single container on a local machine, never distributed or horizontally scaled. The database must survive container restarts via a volume mount.

## Decision Drivers

* Single-container, local-only deployment — no need for client-server database
* Zero infrastructure overhead — no separate database container or service to manage
* Bun has a built-in, high-performance SQLite driver (`bun:sqlite`)
* Data must survive container restarts (Docker volume mount)
* Simple backup — copy a single file
* Read-heavy workload (permission checks on every MCP tool call)

## Considered Options

* SQLite via `bun:sqlite` — Embedded, zero-config, file-based database natively integrated with Bun
* PostgreSQL (in separate container) — Full-featured relational database running as a standalone container service
* JSON file storage — Flat file system reading and writing structured JSON documents

## Decision Outcome

Chosen option: "SQLite via `bun:sqlite`", because it's a zero-dependency, embedded database that aligns perfectly with a single-container local application. Bun's built-in driver provides synchronous, high-performance access. The entire database is a single file, making Docker volume mounts and backups trivial. WAL mode enables concurrent reads during write operations.

### Consequences

* Good, because zero operational overhead is required — no separate database service to configure, orchestrate, or monitor
* Good, because native `bun:sqlite` integration eliminates npm package dependencies and provides a fast synchronous API for clean application code
* Good, because single-file storage makes Docker volume mounts (`./data:/data`) and manual/automated backups (copying a single `.sqlite` file) trivial
* Good, because Write-Ahead Logging (WAL) mode enables non-blocking concurrent reads while writes occur, ensuring low latency for high-frequency permission checks
* Good, because full SQL support enables relational schemas, joins, secondary indexes, foreign keys, and atomic transactions for complex permission matrices and audit logs
* Neutral, because schema migrations must be handled programmatically on startup (e.g., via `CREATE TABLE IF NOT EXISTS` or light migration scripts)
* Bad, because SQLite lacks native network protocol support for horizontal scaling or remote database replication (though unnecessary for a local-only router)
* Bad, because write concurrency is restricted to a single writer process at a time due to file lock mechanics

## Pros and Cons of the Options

### SQLite via `bun:sqlite`

Use SQLite as an embedded relational database utilizing Bun's built-in `bun:sqlite` C-binding driver. Store all application tables (servers, tools, API keys, permissions, audit logs) in a single SQLite database file persisted to disk via a Docker host volume mount.

* Good, because no standalone database server or daemon process is required, minimizing application RAM footprint and eliminating IPC network latency.
* Good, because `bun:sqlite` is built into the Bun runtime binary, delivering high-performance synchronous execution without external package management dependencies.
* Good, because holding all application state in a single file makes disk volume mounts (`-v ./data:/data`) and backup snapshotting as simple as copying the file.
* Good, because enabling Write-Ahead Logging (`PRAGMA journal_mode = WAL;`) allows concurrent read queries during active write operations, maintaining minimal latency during permission authorization.
* Good, because standard relational capabilities (foreign key constraints, indexes, transaction isolation, JSON queries) provide robust data integrity for audit logs and permission rules.
* Neutral, because database schema migrations must be checked and applied programmatically during startup initialization.
* Bad, because SQLite locks the database file for writing, serializing concurrent writes (though well within performance requirements for local single-user workloads).
* Bad, because file locking mechanics prevent horizontal scaling across multiple container instances mounted on shared network storage.

### PostgreSQL (in separate container)

Deploy a dedicated PostgreSQL database container alongside the MCP Router application container within a shared Docker network.

* Good, because PostgreSQL provides advanced client-server relational capabilities, high write concurrency, and enterprise transaction features.
* Good, because mature third-party migration frameworks (e.g., Prisma, Drizzle) offer out-of-the-box support for schema management.
* Good, because it enables future horizontal scaling across multiple application instances if required.
* Bad, because running a secondary database container significantly increases memory footprint and operational complexity for a local desktop app.
* Bad, because deployment requires multi-container orchestration (e.g., Docker Compose), database user management, network configuration, and health-check loops.
* Bad, because socket-based network IPC query overhead is slower than Bun's direct in-memory SQLite bindings.

### JSON file storage

Persist configuration state, permissions, and logs using formatted JSON files on disk (e.g., `config.json`, `audit_logs.json`), maintaining an in-memory cache synchronized with disk updates.

* Good, because file contents remain human-readable and directly editable via standard text editors without database management tools.
* Good, because initial file parsing implementation is straightforward for small configuration structures.
* Bad, because the lack of database indexing requires full file scans to search audit logs or filter authorization rules.
* Bad, because un-indexed concurrent file writes risk race conditions or file corruption without custom locking mechanisms.
* Bad, because lack of atomic transaction support means unexpected power failure or container restart during a write can result in corrupted state.

## More Information

The SQLite database file is stored at `/data/mcp-router.sqlite` inside the container. WAL mode (`PRAGMA journal_mode = WAL;`) and synchronous normal (`PRAGMA synchronous = NORMAL;`) are initialized at database startup for optimal performance and durablity. For runtime environment context, see ADR-0001.
