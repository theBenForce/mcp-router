---
status: "accepted"
date: 2026-08-10
---
# Use Hashed API Keys for Downstream Client Authentication

## Context and Problem Statement

Downstream LLM clients connect to the MCP Router's proxy endpoints (`/sse`, `/mcp`) and need to be authenticated and authorized. Each API key grants access to a specific subset of upstream servers and tools (the permission matrix). We need a secure, simple mechanism for generating, storing, and validating these keys.

## Decision Drivers

* Local-only application — no need for enterprise-grade identity providers
* API keys must be easy to create, copy, and paste into LLM client configurations
* Keys must be stored securely — if the database is compromised, keys should not be recoverable
* Each key maps to a permission matrix (which servers/tools are accessible)
* Validation must be fast — every MCP request requires a key lookup
* Keys should be revocable without affecting other keys

## Considered Options

* SHA-256 hashed API keys — Generate random tokens with a `mcpr_` prefix. Store only the SHA-256 hash in the database. Show the full key exactly once at creation time. Validate by hashing the incoming token and looking up the hash.
* JWT tokens — Encode permissions directly in the token. No database lookup needed for validation. But tokens can't be revoked without a blacklist, and embedding permissions means they become stale when the matrix changes.
* Basic auth (username/password) — Simple but cumbersome for programmatic clients. Would need a session system for the dashboard.
* mTLS (mutual TLS) — Very secure but extremely complex to manage for local use. Certificate generation and distribution is overkill.

## Decision Outcome

Chosen option: "SHA-256 hashed API keys", because they provide a secure, simple, and familiar pattern. Keys are prefixed with `mcpr_` for easy identification. Only the hash is stored, so a database breach doesn't expose valid keys. The `key_prefix` column (first 8 chars) enables display in the UI without exposing the full key. SHA-256 hashing is fast enough for per-request validation. Keys are individually revocable by setting `is_active = 0`.

### Consequences

* Good, because secure storage — only hashes stored, full key shown once at creation
* Good, because fast validation — SHA-256 hash + indexed lookup is sub-millisecond
* Good, because simple client integration — paste `Authorization: Bearer mcpr_...` or `?apiKey=mcpr_...` into any MCP client config
* Good, because individually revocable without affecting other keys
* Good, because `mcpr_` prefix makes keys identifiable and prevents confusion with other credentials
* Good, because permission changes take effect immediately (permissions are in the database, not embedded in the token)
* Neutral, because requires a database lookup on every request (vs JWT which is self-contained), but SQLite is fast enough locally
* Bad, because if a key is lost, it cannot be recovered — user must create a new one
* Bad, because no built-in key rotation mechanism (user must manually create new key, update clients, revoke old key)

## Pros and Cons of the Options

### SHA-256 hashed API keys

Generate a cryptographically secure random token consisting of a `mcpr_` prefix followed by 32 random bytes (hex-encoded, resulting in a 69-character token). Store only the SHA-256 hash (`key_hash`) and the prefix (`key_prefix`, first 8 characters) in SQLite. Display the full key once upon creation.

* Good, because security best practices are preserved by storing cryptographic hashes rather than plaintext secrets in the database.
* Good, because the `mcpr_` prefix allows Secret Scanning tools to detect accidentally committed keys and helps users identify key types easily.
* Good, because checking incoming credentials requires a single SHA-256 hash operation and a primary/unique key lookup on SQLite, taking less than 1ms.
* Good, because updating a key's permissions in the database immediately alters client access without requiring key re-issuance.
* Good, because revoking a compromised key is an immediate database update (`UPDATE api_keys SET is_active = 0 WHERE id = ?`).
* Neutral, because every request requires a database read to validate the key, though SQLite's local file access makes this performance overhead negligible.
* Bad, because if a user loses their generated key string, it cannot be revealed or retrieved from the system; a new key must be generated.
* Bad, because key rotation requires manual user intervention across both the MCP Router dashboard and downstream LLM clients.

### JWT tokens

Generate signed JSON Web Tokens (JWTs) containing client identity and embedded permission scopes signed with a server secret key.

* Good, because downstream validation can be stateless (verifying the signature with a secret key without querying SQLite).
* Good, because JWTs can naturally support built-in expiration (`exp` claims).
* Bad, because revoking a JWT before its expiration requires maintaining a centralized revocation blacklist in the database, negating the stateless advantage.
* Bad, because permission matrix changes do not affect existing clients until their current JWT expires or is revoked.
* Bad, because JWT strings are long, opaque, and cumbersome to copy into LLM client configuration files compared to clean API keys.

### Basic auth (username/password)

Require HTTP Basic Authentication (`Authorization: Basic <credentials>`) using standard username and password combinations for downstream LLM clients.

* Good, because HTTP Basic Auth is widely supported across web clients and HTTP libraries.
* Good, because username/password concepts are familiar to all users.
* Bad, because LLM clients and agent SDKs often expect standard Bearer tokens or API keys rather than basic auth headers.
* Bad, because managing passwords for non-human programmatic clients creates friction and encourages weak password choices or password reuse.
* Bad, because basic auth does not fit cleanly into query parameter authentication (`?apiKey=...`), which is needed by certain SSE clients.

### mTLS (mutual TLS)

Require client-side TLS certificates for every downstream connection to authenticate LLM clients at the transport layer.

* Good, because transport-layer authentication provides extremely strong security with zero HTTP-level header overhead once connected.
* Good, because network connections cannot be established without a valid signed client certificate.
* Bad, because managing a local Certificate Authority (CA), issuing client certificates, and installing certificates into LLM applications is extremely complex.
* Bad, because many LLM clients do not support custom client-side mTLS certificate configuration.
* Bad, because mTLS is massive over-engineering for a local Docker-based desktop application.

## More Information

Key format: `mcpr_` + 32 random bytes (hex-encoded) = 69 character token. Storage: `api_keys` table with `key_hash` (SHA-256, indexed unique) and `key_prefix` (first 8 chars for display). Clients authenticate via `Authorization: Bearer mcpr_...` header or `?apiKey=mcpr_...` query parameter. See ADR-0005 for transport endpoints and ADR-0004 for database schema.
