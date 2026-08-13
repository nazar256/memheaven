<p align="center"><img src="assets/memheaven-logo.png" alt="MemHeaven logo" width="180"></p>

# MemHeaven

**MemHeaven is a self-hosted MCP memory server for ChatGPT and other cloud AI agents.**

It gives hosted AI clients a remote, searchable long-term memory you own, deployed on Cloudflare. MemHeaven is inspired by [MemPalace](https://github.com/MemPalace/mempalace)'s long-term-memory model while using a remote deployment shape for hosted clients.

**Deploy on a Cloudflare Free account. No VM, no Docker, no database admin.**

Free-tier limits apply; heavy usage may require paid Cloudflare usage.

**Quick links:** [Quickstart](#fastest-happy-path) · [Getting started from zero](docs/GETTING_STARTED_FROM_ZERO.md) · [ChatGPT setup](#chatgpt-setup) · [Client compatibility](docs/CLIENT_COMPATIBILITY.md) · [Security model](docs/SECURITY.md) · [Behavior evals](docs/BENCHMARKS.md)

## What problem it solves

AI assistants are useful in the moment, but they often forget project context across chats, sessions, and tools.

Built-in memory features can help, but they are usually provider-owned and are not the same thing as an inspectable, searchable memory layer you control. Local-first memory tools are powerful too, but hosted clients like ChatGPT and other remote agents need a remote MCP server.

MemHeaven is for people who want:

- searchable memory they own
- inspectable and deletable stored context
- continuity for coding agents and other AI workflows across sessions
- a remote MCP deployment shape instead of a laptop-only setup

## When MemHeaven fits

Choose MemHeaven when a hosted client or AI agent needs a searchable memory layer that persists outside the current chat:

- ChatGPT needs to retrieve project decisions, preferences, notes, or other durable context across chats.
- A remote MCP client cannot depend on a memory service running only on your laptop.
- Separate users or workflows need tenant-scoped access to stored context.
- You want to inspect, search, and delete the records held by your own deployment.

## External memory, not a replacement for ChatGPT memory

MemHeaven does not change ChatGPT's built-in memory. It is a separate OAuth-protected MCP service that your client can call for context stored in your own deployment. There is no shared public MemHeaven instance: you operate the Worker, storage bindings, OAuth configuration, and access keys in your Cloudflare account.

## MemHeaven versus Cloudflare Agent Memory

Cloudflare Agent Memory is a separate private-beta Cloudflare product accessed through a Worker binding or Cloudflare HTTP API. MemHeaven is open-source code that you deploy in your own Cloudflare account and expose as an authenticated remote MCP server for ChatGPT and other compatible clients. MemHeaven's deployment and storage are part of this repository; it does not depend on the separate Agent Memory product.

## What is an MCP memory server?

An MCP memory server is an external service that stores durable information outside the current chat and exposes memory operations to an AI client over the Model Context Protocol. In practice, an agent can write, search, update, and delete scoped records instead of starting every session cold.

MemHeaven is the self-hosted remote variant: you deploy the MCP server and its storage in your own Cloudflare account, then connect ChatGPT or another compatible client to the authenticated `/mcp` endpoint.

MCP memory complements document retrieval rather than replacing it: RAG searches a pre-existing corpus, while a memory server preserves durable facts, decisions, and context learned during agent interactions. MemHeaven is for searchable cross-session memory, not a generic document-ingestion service.

## ChatGPT long-term memory over remote MCP

If you want ChatGPT to use a searchable memory layer across chats without putting that memory in a shared third-party service, deploy MemHeaven in your own Cloudflare account and connect ChatGPT to your instance's `/mcp` endpoint. This external memory complements ChatGPT's built-in memory: you can inspect, search, and delete the records stored by your own deployment. See the [ChatGPT setup](#chatgpt-setup) and [security model](docs/SECURITY.md) before connecting a client.

## Why MemHeaven exists

- AI assistants forget project context across chats and sessions.
- Built-in memory is useful, but it is usually provider-owned and not an exact, searchable memory layer.
- Local-first memory tools are powerful, but hosted clients need remote MCP.
- Users want inspectable, searchable, deletable, portable memory.
- Coding agents need continuity across sessions, editors, and tools.

## Cloudflare Free account is enough for personal use

MemHeaven is designed for personal use and small trusted-group usage on Cloudflare-managed services.

- **Worker** runs the HTTP server.
- **D1** stores relational metadata and indexes.
- **R2** stores drawer and diary bodies.
- **Vectorize** powers semantic vector search.
- **Workers AI** generates embeddings.

That means:

- no VM
- no Docker
- no database admin
- no long-running server process

Free-tier limits apply. MemHeaven does **not** promise unlimited free usage, enterprise uptime, or zero cost under every workload. Also note that some underlying Cloudflare services, especially Vectorize, have their own plan and usage constraints, so review the current Cloudflare pricing before a broad rollout.

## Fastest happy path

```bash
npm install
cp wrangler.toml.example wrangler.toml
npm run init -- --base-url https://memheaven.<your-workers-subdomain>.workers.dev
npm run secrets:generate

npx wrangler secret put JWT_SIGNING_SECRET
npx wrangler secret put TOKEN_ENCRYPTION_KEY
npx wrangler secret put AUTH_KEY_PEPPER

export AUTH_KEY_PEPPER='<same AUTH_KEY_PEPPER value>'
npm run keygen -- --tenant personal --label "Personal"

npx wrangler deploy
```

Then connect your hosted client to:

```text
https://memheaven.<your-workers-subdomain>.workers.dev/mcp
```

When the authorization page opens, paste the printed `raw_key`.

If you want the hand-holding version, use [`docs/GETTING_STARTED_FROM_ZERO.md`](docs/GETTING_STARTED_FROM_ZERO.md).

## Supported / expected clients

| Client | Status | Notes |
| --- | --- | --- |
| ChatGPT | **Confirmed** | Manually verified end-to-end for the `/mcp` URL, OAuth authorization flow, and a `mempalace_status` tool call |
| Claude.ai hosted connectors | **Expected** | Known exact hosted callback is allowlisted, but public docs do not expose the URL and end-to-end verification is still needed |
| Local IDE / CLI MCP clients | **Expected** | Generic localhost / 127.0.0.1 / [::1] loopback OAuth callbacks are already allowed |
| VS Code / GitHub Copilot MCP | **Expected for local loopback; hosted OAuth unknown** | Generic localhost callbacks are allowlisted; no exact `vscode.dev` hosted callback is currently pre-allowlisted |
| Grok / xAI | **Expected with bearer/header auth** | Treat as an `Authorization: Bearer <OAuth access token>` integration for `/mcp`, not as a hosted OAuth callback allowlist target |
| Perplexity / Abacus | **Not applicable / Unknown** | No confirmed hosted-client callback contract is allowlisted |

Full details: [`docs/CLIENT_COMPATIBILITY.md`](docs/CLIENT_COMPATIBILITY.md)

## Agent memory instruction

Use MemHeaven conservatively for writes and proactively for reads when prior context matters. The MCP tools return their own detailed guidance, so the ChatGPT/custom-agent instruction can stay short.

Copy-paste instruction for agents:

```text
Use MemHeaven for cross-session memory. When prior context may matter,
start with mempalace_wake_context if available; otherwise call
mempalace_status and follow its returned guidance. Do not mix work,
personal, or project scopes. Save only durable facts, decisions, and
preferences as concise plain text.
```

Full guide: [`docs/AGENT_MEMORY_PROTOCOL.md`](docs/AGENT_MEMORY_PROTOCOL.md)

## Inspired by MemPalace

MemHeaven is inspired by [MemPalace](https://github.com/MemPalace/mempalace), the open-source local-first AI memory project that helped show how useful verbatim, searchable long-term memory can be for AI agents.

MemPalace made a strong case for keeping original context and organizing it in a navigable memory structure. MemHeaven explores a different deployment shape: remote MCP memory for hosted clients and trusted shared setups.

We see that as complementary to MemPalace’s on-device approach, not a replacement for it.

## How it works at a high level

- A Cloudflare Worker exposes OAuth endpoints and the authenticated `/mcp` endpoint.
- Hosted AI clients connect over Streamable HTTP MCP.
- D1 stores metadata, indexes, KG facts, tunnels, quotas, and audit rows.
- R2 stores full verbatim drawer and diary bodies.
- Workers AI generates embeddings.
- Vectorize performs semantic search over chunked memory content.
- Access keys gate authorization and map users to tenant-scoped memory.

## Documentation

- [`docs/GETTING_STARTED_FROM_ZERO.md`](docs/GETTING_STARTED_FROM_ZERO.md)
- [`docs/CLIENT_COMPATIBILITY.md`](docs/CLIENT_COMPATIBILITY.md)
- [`docs/AGENT_MEMORY_PROTOCOL.md`](docs/AGENT_MEMORY_PROTOCOL.md)
- [`docs/SECURITY.md`](docs/SECURITY.md)

## What is included

- OAuth 2.1 + PKCE + dynamic client registration for ChatGPT-compatible remote MCP.
- Access-key-gated consent page backed by stateless JWT auth artifacts.
- Tenant-scoped drawer, diary, knowledge-graph, and tunnel storage.
- Streamable HTTP MCP server using `WebStandardStreamableHTTPServerTransport` with per-request stateless bootstrap.
- MemPalace-compatible `mempalace_*` tool surface, including adapted local-only tools.
- Worker-safe semantic search using Workers AI embeddings + Vectorize + R2/D1 hydration.
- Quota guardrails, redacted audit logging, smoke scripts, and local test coverage.
- Synthetic memory behavior evals for retrieval, scope isolation, tenant isolation, and KG lifecycle regressions.

## Memory behavior evals

Use the local eval harness before/after retrieval, wake-context, or KG behavior changes:

```bash
npm run eval:local
npm run eval:baseline
```

The optional remote smoke/eval skips safely unless configured with environment variables:

```bash
npm run eval:remote
```

See [`docs/BENCHMARKS.md`](docs/BENCHMARKS.md). These are MemHeaven self-evals with synthetic fixtures, not MemHeaven-vs-MemPalace benchmark claims.

## How this differs from upstream MemPalace

- Preserves tool names, wings/rooms/drawers model, Memory Protocol, diary, KG, and tunnel concepts where practical.
- Does **not** preserve Python runtime, ChromaDB internals, filesystem sync, or local desktop hook behavior.
- Stores verbatim drawer and diary bodies in R2; D1 and Vectorize are indexes/metadata, not source of truth.
- Uses short-lived JWT authorization codes plus access and refresh tokens with durable replay protection instead of server-side OAuth sessions.

## Public routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/` | Service info and endpoint map |
| GET | `/health` | Binding/config/quota capability status |
| GET | `/.well-known/oauth-authorization-server` | OAuth authorization server metadata |
| GET | `/.well-known/oauth-protected-resource` | Protected resource metadata |
| GET | `/.well-known/oauth-protected-resource/mcp` | MCP protected resource metadata |
| POST | `/register` | Dynamic client registration |
| GET / POST | `/authorize` | Consent page and access-key entry |
| POST | `/token` | Authorization-code and refresh-token exchange |
| GET / POST / DELETE | `/mcp` | Authenticated Streamable HTTP MCP endpoint |

## Tools

Implemented MemPalace-compatible tools are grouped by domain below. Each tool is listed individually so directory indexes can extract its name and description.

**Palace read tools**

- `mempalace_status` — Diagnostics and backend capabilities for memory-relevant chats.
- `mempalace_wake_context` — Start a memory-relevant chat with bounded, privacy-scoped startup context.
- `mempalace_list_wings` — List tenant-scoped wings and active drawer counts.
- `mempalace_list_rooms` — List tenant-scoped rooms and active drawer counts for one wing or all wings.
- `mempalace_get_taxonomy` — Return the current tenant-scoped wing and room taxonomy.
- `mempalace_get_aaak_spec` — Return compact guidance for concise, readable memory notes.
- `mempalace_search` — Search tenant-scoped drawers with hybrid semantic and lexical retrieval.
- `mempalace_check_duplicate` — Check for exact or semantic duplicates before writing memory.
- `mempalace_get_drawer` — Fetch one tenant-scoped drawer with bounded content and provenance.
- `mempalace_list_drawers` — List active tenant-scoped drawers with optional wing and room filters.

**Palace write tools**

- `mempalace_add_drawer` — Add durable drawer content and index it semantically.
- `mempalace_update_drawer` — Update a drawer and reindex changed content or metadata.
- `mempalace_delete_drawer` — Soft-delete a tenant-scoped drawer and remove its semantic index entries.

**Diary tools**

- `mempalace_diary_write` — Write a concise diary entry and index it for scoped search.
- `mempalace_diary_read` — Read recent diary entries with optional wing and room filters.
- `mempalace_diary_search` — Search diary entries for one explicit agent with hard scope filters.
- `mempalace_diary_reindex` — Backfill or refresh diary semantic index rows for the tenant.

**Knowledge graph tools**

- `mempalace_kg_query` — Query tenant-scoped temporal knowledge-graph facts.
- `mempalace_kg_check` — Run deterministic reliability checks for active KG conflicts and stale facts.
- `mempalace_kg_add` — Add a tenant-scoped temporal knowledge-graph fact.
- `mempalace_kg_invalidate` — Invalidate an exact tenant-scoped knowledge-graph fact.
- `mempalace_kg_timeline` — Show the recent knowledge-graph timeline for an entity or all facts.
- `mempalace_kg_stats` — Return tenant-scoped knowledge-graph statistics.

**Navigation and graph tools**

- `mempalace_traverse` — Traverse the tenant shared-room graph and explicit tunnels.
- `mempalace_find_tunnels` — Find tenant-scoped cross-wing shared rooms that behave like passive tunnels.
- `mempalace_graph_stats` — Return tenant-scoped graph, shared-room, and explicit tunnel statistics.
- `mempalace_create_tunnel` — Create an explicit tenant-scoped tunnel between wing and room locations.
- `mempalace_list_tunnels` — List tenant-scoped explicit tunnels, optionally filtered by endpoint wing.
- `mempalace_delete_tunnel` — Delete a tenant-scoped explicit tunnel by ID.
- `mempalace_follow_tunnels` — Follow explicit tunnels connected to a wing and room location.

**Deployment adaptations**

- `mempalace_hook_settings` — Return the configured save policy for this deployment.
- `mempalace_memories_filed_away` — Return the latest tenant-scoped write filing status.
- `mempalace_reconnect` — Return configured binding and index health.
- `mempalace_sync` — Report that local filesystem and git sync is unsupported in hosted mode.

This MVP intentionally omits generic `search` / `fetch` aliases to avoid duplicating the primary MemPalace surface unless connector UX proves they are needed later.

All exposed MCP tools also advertise structured `outputSchema` metadata so ChatGPT and other MCP clients can better understand successful tool results from `tools/list`.

## Prerequisites

- Node.js 20+
- npm 10+
- Cloudflare account with Workers, D1, R2, Vectorize, and Workers AI enabled
- `wrangler` authenticated against the target Cloudflare account

## Quickstart

This is the fastest happy path for self-hosting MemHeaven.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Choose the public base URL. This must be the origin only; do not include `/mcp`.

   - Workers.dev example: `https://memheaven.<your-workers-subdomain>.workers.dev`
   - Custom domain example: `https://memory.example.com`

   Pick the final public origin you actually plan to keep using. Changing the public origin later changes the OAuth issuer/client identity and will force hosted clients like ChatGPT to reconnect.

3. Create the local Wrangler config:

   ```bash
   cp wrangler.toml.example wrangler.toml
   ```

4. Create Cloudflare resources, patch `wrangler.toml`, and apply remote migrations:

   ```bash
   npm run init -- --base-url https://memheaven.<your-workers-subdomain>.workers.dev
   ```

5. Generate valid secret material:

   ```bash
   npm run secrets:generate
   ```

6. Upload the generated secrets:

   ```bash
   npx wrangler secret put JWT_SIGNING_SECRET
   npx wrangler secret put TOKEN_ENCRYPTION_KEY
   npx wrangler secret put AUTH_KEY_PEPPER
   ```

7. Generate your first access key and sync `ACCESS_KEYS_JSON`:

   ```bash
   export AUTH_KEY_PEPPER='<same AUTH_KEY_PEPPER value>'
   npm run keygen -- --tenant personal --label "Personal"
   ```

8. Validate locally, then deploy:

   ```bash
   npm run lint
   npm run typecheck
   npm test
   npm run build
   npx wrangler deploy --dry-run --outdir .tmp/wrangler-bundle
   npx wrangler deploy
   ```

## Bootstrap Cloudflare resources

```bash
cp wrangler.toml.example wrangler.toml
npm run init -- --base-url https://memheaven.<your-workers-subdomain>.workers.dev
```

`npm run init` now:

- checks Wrangler authentication
- creates or reuses the D1 database, R2 bucket, and Vectorize index defined in local `wrangler.toml`
- creates the required Vectorize metadata indexes (`tenant_id`, `wing`, `room`, `kind`, `agent_name`, `topic`)
- patches the matching `[[d1_databases]]` block in `wrangler.toml` with the real D1 `database_id`
- patches `OAUTH_ISSUER`, `MCP_RESOURCE`, and `MCP_AUDIENCE` when `--base-url` is provided
- applies remote D1 migrations by default

`wrangler.toml` is intentionally gitignored because `npm run init -- --base-url ...` patches account-specific deployment values. Commit changes to `wrangler.toml.example` when defaults change.

Useful variants:

```bash
npm run init -- --dry-run
npm run init -- --skip-migrations
npm run init -- --base-url https://memory.example.com
```

After bootstrap, continue with secrets and access-key setup below. If you later bind a custom domain, rerun `npm run init -- --base-url https://memory.example.com` or manually update the three OAuth/MCP vars in `wrangler.toml`, then redeploy.

## Configure secrets

Generate valid secrets:

```bash
npm run secrets:generate
```

This prints JSON with valid values for:

- `JWT_SIGNING_SECRET`
- `TOKEN_ENCRYPTION_KEY`
- `AUTH_KEY_PEPPER`

Store them with Wrangler:

```bash
npx wrangler secret put JWT_SIGNING_SECRET
npx wrangler secret put TOKEN_ENCRYPTION_KEY
npx wrangler secret put AUTH_KEY_PEPPER
```

Generate an access key and automatically maintain the local git-ignored key store plus the Cloudflare `ACCESS_KEYS_JSON` secret:

```bash
export AUTH_KEY_PEPPER='<same AUTH_KEY_PEPPER value>'
npm run keygen -- --tenant personal --label "Personal"
```

By default this command:

- appends the new hashed key record into `.tmp/access-keys.json`
- uploads the full merged JSON array to the Worker secret `ACCESS_KEYS_JSON` using `npx wrangler secret put`
- prints the new raw key once so you can paste it into the consent form

If you only want to update the local git-ignored file without touching Cloudflare yet:

```bash
export AUTH_KEY_PEPPER='<same AUTH_KEY_PEPPER value>'
npm run keygen -- --tenant personal --label "Personal" --no-sync
```

If you want a custom local file, it must stay under `.tmp/`:

```bash
export AUTH_KEY_PEPPER='<same AUTH_KEY_PEPPER value>'
npm run keygen -- --tenant personal --label "Personal" --file .tmp/my-access-keys.json --no-sync
```

The local file stores only hashed records, never raw keys. Save the printed raw key somewhere safe immediately because it is not written to disk.

### Key rotation

1. Run `npm run keygen -- --tenant <tenant> --label <label>` to append a new active record.
2. Move clients to the new raw key.
3. Mark the old record inactive or remove it from `.tmp/access-keys.json`.
4. Re-upload the full JSON array with `npx wrangler secret put ACCESS_KEYS_JSON` if you edited the file manually.

Removing or deactivating a key invalidates existing access/refresh tokens for that key on the next `/mcp` or refresh-token check.

If you rotate `AUTH_KEY_PEPPER`, every existing raw access key becomes invalid because hashes are computed from `raw_key + AUTH_KEY_PEPPER`. After changing the pepper, regenerate all access keys and sync a fresh `ACCESS_KEYS_JSON`.

## Apply D1 migrations manually (optional)

`npm run init` already applies remote migrations by default. If you skip them during bootstrap or need to rerun them later, Wrangler v4 defaults D1 commands to local mode, so use `--remote` explicitly for the deployed database.

```bash
npx wrangler d1 migrations apply memheaven_memory --remote
```

## Multi-tenant access-key model

- Each access key belongs to exactly one `tenant_id`.
- `tenant_id` is derived only from the verified bearer token; MCP tools never accept tenant selection from tool input.
- Every active key id must be globally unique across all tenants.
- Every key hash must be unique; do not reuse the same raw key for multiple tenants.
- Effective token scopes are bounded by the currently active key record, so narrowing a key's scopes also narrows future refreshed/access-token permissions.
- D1 queries include `tenant_id`, R2 keys are prefixed with `tenants/{tenant_id}/...`, Vectorize queries filter by `tenant_id`, and Vectorize hits are rechecked against D1 before content is returned.

Add another tenant:

```bash
export AUTH_KEY_PEPPER='<same AUTH_KEY_PEPPER value>'
npm run keygen -- --tenant family-member --label "Family member"
npx wrangler deploy
```

The new command output prints a different `raw_key`. Give that key only to that tenant. Their drawers, diary entries, KG facts, and tunnels are isolated from the `personal` tenant.

Recommended operator checklist before sharing a second key:

1. Create a brand-new raw key and unique `id`.
2. Assign exactly one `tenant_id`.
3. Keep only the minimum scopes needed (`memory.read`, `memory.write`).
4. Deploy and validate that tenant A and tenant B cannot see each other's drawers, diary entries, KG facts, or tunnels.

## Local validation

```bash
npm run lint
npm run typecheck
npm test
npm run build
npx wrangler deploy --dry-run --outdir .tmp/wrangler-bundle
```

Notes:

- `npm run build` emits Worker build artifacts to `.tmp/dist`.
- `wrangler deploy --dry-run --outdir .tmp/wrangler-bundle` validates the deploy bundle without changing production state.

## Deploy

Before deploying, make sure:

- `wrangler.toml` exists locally and `npm run init -- --base-url <public-origin>` has patched it with the right D1 id and OAuth/MCP URLs.
- `JWT_SIGNING_SECRET`, `TOKEN_ENCRYPTION_KEY`, `AUTH_KEY_PEPPER`, and `ACCESS_KEYS_JSON` are set with `npx wrangler secret put ...`.
- The connector URL you plan to enter in your client is exactly `<public-origin>/mcp`.

```bash
npx wrangler deploy --dry-run --outdir .tmp/wrangler-bundle
npx wrangler deploy
```

## ChatGPT setup

1. Add the connector using `https://memory.example.com/mcp` or your workers.dev `/mcp` URL.
2. ChatGPT performs OAuth discovery and dynamic client registration automatically.
3. On `/authorize`, enter a valid `raw_key` printed by `npm run keygen`.
4. Approve the connector.
5. ChatGPT will use bearer tokens against `/mcp`.
6. Optionally add the short [agent memory instruction](#agent-memory-instruction) to ChatGPT's custom instructions so it knows when to start from MemHeaven.

ChatGPT has been manually verified end-to-end for MemHeaven's `/mcp` URL, OAuth authorization flow, and a `mempalace_status` tool call. That confirms the main hosted-client path without claiming that every ChatGPT plan or workspace supports custom MCP connectors.

Redirect URIs are intentionally restricted to documented ChatGPT and Claude callback contracts plus generic localhost loopback flows. Non-OAuth hosts can only work when they can call `/mcp` with `Authorization: Bearer <token>`.

## Smoke scripts

OAuth discovery smoke:

```bash
npm run smoke:oauth -- --base https://your-domain.example
```

Authenticated MCP smoke:

```bash
export MEMHEAVEN_BEARER_TOKEN='<bearer-token>'
npm run smoke:mcp -- --base https://your-domain.example
```

Vector metadata reindex helper:

```bash
npm run reindex -- --base https://your-domain.example --dry-run
npm run reindex -- --base https://your-domain.example
npm run reindex -- --kind diary --base https://your-domain.example --dry-run
npm run reindex -- --kind all --base https://your-domain.example
```

Use the reindex helper if you created Vectorize metadata indexes after data had already been embedded and inserted. After upgrading an existing deployment to diary semantic search, run `npm run init` to ensure the `agent_name` and `topic` Vectorize metadata indexes exist, then run `npm run reindex -- --kind diary --base https://your-domain.example` to backfill existing diary entries from R2 into `diary_chunks` and Vectorize. Use `--kind all` when both drawer and diary vectors should be refreshed.

## Troubleshooting

- `401 invalid_token` on `/mcp`: token expired, key was removed, or the bearer token is missing.
- `authorization failed` / `wrong key`: make sure the raw key was generated with the same `AUTH_KEY_PEPPER` that is deployed as the Worker secret, and that `npm run keygen` synced the latest `ACCESS_KEYS_JSON`.
- `406 Not Acceptable` on `/mcp`: the client must send `Accept: application/json, text/event-stream`.
- `503` from `/health`: a required secret or binding is missing or invalid.
- `Quota exceeded`: wait for UTC reset or raise the configured per-tenant limits.
- Search/index issues after metadata-index rollout: rerun `npm run init` to ensure metadata indexes, then rerun `npm run reindex ...`; use `--kind diary` or `--kind all` when diary semantic search was added after diary entries already existed.
- Local browser OAuth on `http://127.0.0.1`/`localhost`: the `/authorize` CSRF cookie is intentionally non-Secure in local HTTP mode so the browser can return it on consent POST.
- Immediate post-write semantic search may briefly return empty while Vectorize finishes indexing; retry shortly if a newly added drawer or diary entry is not yet searchable.
- `wrangler whoami` looks unauthenticated under wrappers/custom `HOME`: check plain `npx wrangler whoami` in your normal shell before assuming the login is missing.

## Tenant isolation smoke test

After adding a second tenant, validate isolation manually:

1. Connect to ChatGPT with tenant A's raw key and add a unique drawer.
2. Connect in a separate ChatGPT profile/session with tenant B's raw key.
3. Confirm tenant B cannot find tenant A's unique phrase with `mempalace_search`.
4. Confirm tenant B cannot fetch tenant A's `drawer_id` with `mempalace_get_drawer`.
5. Repeat for diary/KG/tunnels if you use those features.

The service does not trust client-supplied tenant information; isolation comes from the verified bearer token and storage-layer tenant filters.

## Limitations

- No ChromaDB or local SQLite compatibility.
- No local filesystem sync; `mempalace_sync` is intentionally unsupported in hosted mode.
- Authorization codes are short-lived and single-use.
- Refresh tokens rotate with replay detection. Removing or deactivating the backing access key still invalidates future token checks for that key.
- Embeddings use `@cf/baai/bge-small-en-v1.5`, so long drawer bodies are chunked before indexing.
- Vectorize dimensions are locked to the configured index (`384` for the default MVP setup).
- Hosted-client callback support stays narrow and contract-driven. Other clients may need explicit callback allowlist additions before they work end-to-end.

## Related docs

- `docs/GETTING_STARTED_FROM_ZERO.md`
- `docs/CLIENT_COMPATIBILITY.md`
- `docs/AGENT_MEMORY_PROTOCOL.md`
- `docs/SECURITY.md`
- `docs/PRODUCT_REQUIREMENTS.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/PROJECT_STATE.md`
- `docs/DECISIONS.md`

## License

MIT. See `LICENSE`.
