# Decisions

## D-001: Preserve behavior compatibility, not storage compatibility

- Status: Accepted
- Date: 2026-05-13
- Decision: The Cloudflare port preserves MemPalace tool names and agent-facing behavior where practical, but replaces Python/ChromaDB/filesystem internals with D1, R2, Vectorize, and Workers AI.
- Why: The target environment is Cloudflare Workers, and upstream local storage/runtime assumptions are not portable.

## D-002: OAuth state will be stateless by default

- Status: Accepted
- Date: 2026-05-13
- Decision: Authorization codes, access tokens, and refresh tokens are self-contained signed JWT artifacts, with sensitive embedded claims encrypted via AES-GCM.
- Why: MVP forbids KV/DO-backed OAuth session state and needs Cloudflare Worker portability.
- Tradeoff: Auth codes cannot be strictly one-time-use without adding durable state; this is documented.

## D-003: Verbatim drawer and diary bodies live in R2

- Status: Accepted
- Date: 2026-05-13
- Decision: Full drawer/diary content is stored in R2 as the source of truth, with D1 storing metadata and chunk rows and Vectorize storing semantic indexes only.
- Why: This preserves verbatim memory while keeping Worker request CPU bounded.

## D-004: Tenant isolation is enforced at every storage boundary

- Status: Accepted
- Date: 2026-05-13
- Decision: `tenant_id` is derived only from the verified access token and included in every D1 query, R2 key prefix, and Vectorize filter, with D1 revalidation after vector search.
- Why: Memory isolation is a hard product invariant.

## D-005: Local-only MemPalace tools are adapted, not faked

- Status: Accepted
- Date: 2026-05-13
- Decision:
  - `mempalace_hook_settings` returns hosted save-policy information.
  - `mempalace_memories_filed_away` returns recent tenant write/audit status.
  - `mempalace_reconnect` returns Cloudflare binding/index health.
  - `mempalace_sync` remains registered but returns a clear unsupported response.
- Why: The hosted Worker has no local filesystem, desktop hooks, or Chroma cache, but preserving familiar tool names reduces agent confusion and keeps behavior explicit.

## D-006: Hosted reindexing is exposed as maintenance, not hidden magic

- Status: Accepted
- Date: 2026-05-13
- Decision: `mempalace_update_drawer` supports optional `force_reindex` and the repository ships a `scripts/reindex.ts` helper that calls the MCP API to refresh existing drawer vectors after metadata-index changes.
- Why: Vectorize metadata indexes may be added after initial ingestion; operators need a deterministic hosted recovery path.

## D-007: Generic connector aliases are deferred

- Status: Accepted
- Date: 2026-05-13
- Decision: MVP does not expose extra generic `search` / `fetch` aliases.
- Why: The MemPalace-native surface is already complete, and additional aliases would duplicate behavior without current evidence they are required for ChatGPT Developer Mode.

## D-008: Access-key scopes are enforced at tool execution time

- Status: Accepted
- Date: 2026-05-13
- Decision: MCP read tools require `memory.read` and write/destructive tools require `memory.write`, with effective scopes always intersected against the currently active access-key record during token verification and refresh.
- Why: The deployment is intentionally multi-tenant and key-based. Access keys must be able to grant least privilege and have scope reductions take effect without relying on stale token claims.

## D-009: Local access-key source of truth is a git-ignored hashed store under `.tmp/`

- Status: Accepted
- Date: 2026-05-14
- Decision: `npm run keygen` appends hashed access-key records into `.tmp/access-keys.json` and, by default, syncs the merged array to the Cloudflare `ACCESS_KEYS_JSON` secret. Raw keys are printed once for the operator and are not persisted to disk.
- Why: Operators need a repeatable way to manage the full `ACCESS_KEYS_JSON` secret, but storing raw keys in repo-local files would unnecessarily widen secret exposure. Keeping the persisted local store under `.tmp/` also aligns with repo hygiene and git-ignore rules.

## D-010: First-time Cloudflare resource provisioning is automated via `npm run init`

- Status: Accepted
- Date: 2026-05-14
- Decision: The repo ships `npm run init`, which bootstraps D1/R2/Vectorize resources from `wrangler.toml`, ensures required Vectorize metadata indexes, patches the matching D1 `database_id` in `wrangler.toml`, and applies remote D1 migrations by default.
- Why: First-time setup should not require operators to copy-paste a sequence of Wrangler commands from the README, especially when the project already knows the intended resource names and binding layout.

## D-011: Secret generation is scripted to avoid invalid key material

- Status: Accepted
- Date: 2026-05-14
- Decision: The repo ships `npm run secrets:generate`, which prints valid 32-byte base64url values for `JWT_SIGNING_SECRET`, `TOKEN_ENCRYPTION_KEY`, and `AUTH_KEY_PEPPER`.
- Why: Manual secret generation was error-prone and led directly to invalid `AUTH_KEY_PEPPER` values that failed runtime validation. A scripted generator removes guesswork while keeping secret persistence/operator control explicit.

## D-012: MCP tools should advertise output schemas for stable success payloads

- Status: Accepted
- Date: 2026-05-14
- Decision: Memheaven MCP tools define `outputSchema` for stable success responses and return matching `structuredContent` on successful tool calls.
- Why: ChatGPT and other MCP clients surface a recommendation when tools omit output schemas, and providing them materially improves tool discoverability and result understanding from `tools/list` metadata.
- Tradeoff: Error paths still use `isError: true` rather than forcing failures into a success schema; this matches the MCP SDK guidance and avoids misleading schemas for unsupported/error states.
