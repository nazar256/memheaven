# Project State

## Current milestone

MVP for `memheaven`, a Cloudflare-native MemPalace-compatible remote MCP server with stateless OAuth, access-key gating, tenant isolation, semantic search, diary/KG/tunnel tools, tests, and operator-friendly self-hosting docs.

## Completed

- Audited upstream MemPalace tool surface and documented compatibility/adaptation decisions.
- Implemented Worker routing for service info, health, OAuth discovery, registration, consent, token exchange, and `/mcp`.
- Implemented stateless OAuth 2.1 / PKCE flow with dynamic client registration and access-key consent gate.
- Implemented tenant-scoped drawer, diary, KG, tunnel, quota, and audit storage services backed by D1/R2/Vectorize/Workers AI abstractions.
- Implemented MemPalace-compatible MCP tools and cloud-safe local-tool adaptations.
- Added smoke scripts, key generation helper, reindex helper, CI workflow, and automated tests.
- Hardened multi-tenant behavior further by enforcing access-key scopes at MCP tool execution, validating unique key ids/hashes in config, and rejecting cross-tenant tunnel drawer references.
- Renamed package/service/deployment identity from `mempalace-cloudflare-mcp` to `memheaven` while preserving the `mempalace_*` external tool surface for upstream compatibility.
- Provisioned renamed live Cloudflare D1/R2/Vectorize resources, deployed to workers.dev, applied remote migrations, and validated OAuth + MCP flows end-to-end with two separate tenants.
- Added first-time setup helpers: `npm run init` for Cloudflare resources/config/migrations, `npm run secrets:generate` for valid secret material, and `npm run keygen` for git-ignored tenant key management.
- Added MIT license and scrubbed public-facing docs/config examples so repository publishing does not expose private operator details.
- Added MCP `outputSchema` coverage across the exposed tool surface so ChatGPT can understand structured tool results better.
- Added `mempalace_wake_context` as a privacy-scoped memory startup tool, separate from diagnostic `mempalace_status`, with global curated-context mode and explicit scoped mode.
- Added deterministic hybrid drawer search reranking with lexical/entity/date boosts, duplicate collapse, and `max_distance` filtering.
- Clarified compact memory-note guidance so normal drawer and diary entries use concise readable plain text rather than literal `AAAK:` prefixes unless explicitly requested.
- Hardened KG temporal writes so add and invalidate paths reject inverted intervals before mutation, including date-only start/end semantics and all-or-nothing invalidation preflight.
- Added read-only KG conflict/staleness checks and scoped semantic search for diary entries.
- Added a synthetic memory behavior eval harness with local fake-backed fixtures, baseline comparison, and opt-in remote MCP smoke coverage for retrieval, isolation, duplicates, and KG lifecycle behavior.
- Added manual GitHub Actions remote smoke workflow for configured deployed environments.
- Added product-facing documentation and metadata: rewritten README first screen, zero-to-self-host guide, client compatibility matrix, security docs, agent memory protocol doc, `server.json`, and a lightweight landing-page scaffold.
- Completed hosted-client compatibility and low-effort catalog Linear tasks; MemHeaven is visible in the official MCP Registry, mcpservers.org, mcp.so, and MCP Find.
- Moved shared Worker defaults to `wrangler.toml.example`; real `wrangler.toml` is local-only and gitignored. ChatGPT was promoted back to Confirmed after manual verification of the `/mcp` URL, OAuth authorization flow, and a `mempalace_status` tool call.
- Validated `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npx wrangler deploy --dry-run --outdir .tmp/wrangler-bundle`.

## Validation snapshot

- `npm test` ✅ (76 tests, including MCP output-schema, wake-context, hybrid search, diary semantic search, KG check, and KG interval-integrity coverage)
- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm run build` ✅
- `npx wrangler deploy --dry-run --outdir .tmp/wrangler-bundle` ✅
- `npm run eval:local` ✅ (28 retrieval cases, 2 duplicate cases, 6 KG cases, 0 hard failures)
- `npm run eval:baseline` ✅
- `npm run eval:remote` ✅ (skips safely without environment configuration)
- `npm run init -- --dry-run --base-url https://memory.example.com --skip-migrations` ✅
- Production smoke on a private workers.dev endpoint ✅
- Non-interactive end-to-end OAuth `/register` → `/authorize` → `/token` for two fresh tenant keys on the renamed worker ✅

## Remaining risks / watch items

- Vectorize indexing is eventually consistent, so semantic search may need a brief retry immediately after a write.
- Cloudflare Vectorize metadata-index creation may transiently return 504 even when the index creation eventually completes; verify by retrying and checking for `metadata index already exists`.
- If Vectorize metadata indexes or diary semantic search are added after initial ingestion, operators must rerun `npm run init` to ensure metadata indexes and then use `npm run reindex -- --kind drawer|diary|all` for the affected index data.

## Recommended next steps

1. Rotate/remove any temporary smoke-test keys from the deployed Worker secret if they are no longer needed.
2. Verify additional hosted clients (especially Claude hosted connectors and VS Code / Copilot) before moving them above Expected/Experimental.
3. Optionally bind a custom domain and run `npm run init -- --base-url <custom-origin>` to patch OAuth/MCP URLs before redeploying.
