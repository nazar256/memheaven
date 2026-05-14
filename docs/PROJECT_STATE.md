# Project State

## Current milestone

Publish-ready MVP for `memheaven`, a Cloudflare-native MemPalace-compatible remote MCP server with stateless OAuth, access-key gating, tenant isolation, semantic search, diary/KG/tunnel tools, tests, and operator-friendly deployment docs.

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
- Added public-launch packaging docs and metadata: rewritten README first screen, zero-to-deploy guide, client compatibility matrix, security docs, agent memory protocol doc, launch checklist, `server.json`, `glama.json`, and a lightweight landing-page scaffold.
- Validated `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npx wrangler deploy --dry-run --outdir .tmp/wrangler-bundle`.

## Validation snapshot

- `npm test` ✅ (46 tests, including MCP output-schema coverage)
- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm run build` ✅
- `npx wrangler deploy --dry-run --outdir .tmp/wrangler-bundle` ✅
- `npm run init -- --dry-run --base-url https://memory.example.com --skip-migrations` ✅
- Production smoke on a private workers.dev endpoint ✅
- Non-interactive end-to-end OAuth `/register` → `/authorize` → `/token` for two fresh tenant keys on the renamed worker ✅

## Remaining risks / watch items

- Stateless auth codes are short-lived but not strictly one-time-use without durable state.
- Refresh tokens are revoked at access-key granularity, not individually.
- Vectorize indexing is eventually consistent, so semantic search may need a brief retry immediately after a write.
- Cloudflare Vectorize metadata-index creation may transiently return 504 even when the index creation eventually completes; verify by retrying and checking for `metadata index already exists`.
- If Vectorize metadata indexes are created after initial ingestion, operators must rerun the provided reindex workflow.

## Recommended next steps

1. Before publishing broadly, rotate/remove any temporary smoke-test keys from the deployed Worker secret if they are no longer needed.
2. Add a logo/social preview asset and update `docs/LAUNCH.md` TODOs.
3. Verify additional hosted clients (especially Claude hosted connectors) before moving them above Expected/Experimental.
4. Optionally bind a custom domain and run `npm run init -- --base-url <custom-origin>` to patch OAuth/MCP URLs before redeploying.
