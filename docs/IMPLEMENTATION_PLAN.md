# Implementation Plan

- [x] DOC-010 Audit upstream MemPalace tools, schemas, and behavioral docs
- [x] DOC-020 Create project docs skeleton and compatibility requirements table
- [x] SRC-010 Initialize Cloudflare Worker TypeScript project structure and package metadata
- [x] SRC-020 Add strict TypeScript, Vitest, Wrangler config, and base scripts
- [x] SEC-010 Implement typed config parsing and binding/secret validation with safe health reporting
- [x] SEC-020 Implement crypto helpers for HMAC, AES-GCM, JWT signing/verification, constant-time access-key validation, and redaction helpers
- [x] AUTH-010 Implement OAuth metadata and protected resource metadata endpoints
- [x] AUTH-020 Implement stateless dynamic client registration with deterministic client IDs and redirect validation
- [x] AUTH-030 Implement authorize GET/POST with CSRF, access-key consent gate, PKCE validation, and auth-code issuance
- [x] AUTH-040 Implement token endpoint for authorization-code and refresh-token grants
- [x] AUTH-050 Enforce active-key validation during access-token verification on `/mcp`
- [x] DB-010 Add D1 migration for drawers, chunks, diary, KG, tunnels, quotas, and audit log tables plus indexes
- [x] MEM-010 Implement tenant-scoped D1/R2/Vectorize storage helpers and deterministic IDs
- [x] MEM-020 Implement chunking, embedding, vector upsert/query/delete wrappers, and exact duplicate hashing
- [x] MCP-010 Implement stateless `/mcp` GET/POST/DELETE using `WebStandardStreamableHTTPServerTransport`
- [x] MCP-020 Register MemPalace-compatible tools with strict zod schemas and compact JSON outputs
- [x] TOOL-010 Implement palace read tools (`status`, `list_wings`, `list_rooms`, `taxonomy`, `aaak_spec`, `search`, `check_duplicate`)
- [x] TOOL-020 Implement drawer write/read tools (`add`, `get`, `list`, `update`, `delete`)
- [x] TOOL-030 Implement diary tools (`diary_write`, `diary_read`)
- [x] TOOL-040 Implement KG tools (`kg_query`, `kg_add`, `kg_invalidate`, `kg_timeline`, `kg_stats`)
- [x] TOOL-050 Implement navigation/tunnel tools (`traverse`, `find_tunnels`, `graph_stats`, `create_tunnel`, `list_tunnels`, `delete_tunnel`, `follow_tunnels`)
- [x] TOOL-060 Decide local-only tool strategy (`sync`, `hook_settings`, `memories_filed_away`, `reconnect`) and document rationale
- [x] QUOTA-010 Implement UTC daily usage counters and preflight quota checks for expensive operations
- [x] TEST-010 Add config, OAuth metadata/flow, security primitive, and MCP auth tests
- [x] TEST-020 Add drawer/search/KG/tunnel/diary behavior tests with tenant isolation coverage
- [x] TEST-030 Add quota and validation command coverage, smoke scripts, and local helper scripts
- [x] DOC-030 Finalize README deployment guide, decisions log, AGENTS pointers, project state, and continuation handoff
- [x] QA-010 Run tests, typecheck, build, deploy dry-run, review readiness, and update `CONTINUE.md`
- [x] GLAMA-010 Add isolated stdio composition root with fixed inspection auth and truthful local backend capability reporting
- [x] GLAMA-020 Implement sql.js D1 migrations/transactions, memory R2, deterministic embeddings, and brute-force vector adapters
- [x] GLAMA-030 Add adapter/MCP integration tests, Docker artifact, container stdio smoke, and Glama inspection documentation
- [x] GLAMA-040 Repair CI Worker dry-run with tracked credential-free Wrangler configuration and keep Docker smoke in CI

## Reconciled follow-up candidates

- [x] FUT-010 Add optional generic `search` / `fetch` aliases if real connector UX needs them
  - Deferred by D-007 until real connector UX evidence shows generic aliases are needed.
- [x] FUT-020 Add a fully remote, credentialed operator workflow for bulk drawer reindexing
  - Satisfied by `npm run reindex`, which uses a bearer token and the remote MCP API for drawer and diary maintenance reindexing.
- [x] FUT-030 Add production smoke automation against a deployed preview environment
  - Satisfied by `npm run eval:remote` plus manual `.github/workflows/remote-smoke.yml` automation for configured deployment secrets.
