
# memheaven

Cloudflare-native TypeScript remote MCP server that preserves MemPalace's agent-facing memory behavior while replacing the local Python/ChromaDB/filesystem runtime with Workers, D1, R2, Vectorize, and Workers AI.

## What is included

- OAuth 2.1 + PKCE + dynamic client registration for ChatGPT-compatible remote MCP.
- Access-key-gated consent page backed by stateless JWT auth artifacts.
- Tenant-isolated drawer, diary, knowledge-graph, and tunnel storage.
- Streamable HTTP MCP server using `WebStandardStreamableHTTPServerTransport` with per-request stateless bootstrap.
- MemPalace-compatible `mempalace_*` tool surface, including adapted local-only tools.
- Worker-safe semantic search using Workers AI embeddings + Vectorize + R2/D1 hydration.
- Quota guardrails, redacted audit logging, smoke scripts, and local test coverage.

## How this differs from upstream MemPalace

- Preserves tool names, wings/rooms/drawers model, Memory Protocol, diary, KG, and tunnel concepts where practical.
- Does **not** preserve Python runtime, ChromaDB internals, filesystem sync, or local desktop hook behavior.
- Stores verbatim drawer and diary bodies in R2; D1 and Vectorize are indexes/metadata, not source of truth.
- Uses stateless JWT authorization codes, access tokens, and refresh tokens instead of server-side OAuth sessions.

## Public routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/` | Service info and endpoint map |
| GET | `/health` | Binding/config/quota capability status |
| GET | `/.well-known/oauth-authorization-server` | OAuth authorization server metadata |
| GET | `/.well-known/oauth-protected-resource` | Protected resource metadata |
| GET | `/.well-known/oauth-protected-resource/mcp` | MCP protected resource metadata |
| POST | `/register` | Dynamic client registration |
| GET / POST | `/authorize` | Consent page and access-key submission |
| POST | `/token` | Authorization-code and refresh-token exchange |
| GET / POST / DELETE | `/mcp` | Authenticated Streamable HTTP MCP endpoint |

## Tool surface summary

Implemented MemPalace-compatible tools include:

- Palace read tools: `mempalace_status`, `mempalace_list_wings`, `mempalace_list_rooms`, `mempalace_get_taxonomy`, `mempalace_get_aaak_spec`, `mempalace_search`, `mempalace_check_duplicate`, `mempalace_get_drawer`, `mempalace_list_drawers`
- Palace write tools: `mempalace_add_drawer`, `mempalace_update_drawer`, `mempalace_delete_drawer`
- Diary tools: `mempalace_diary_write`, `mempalace_diary_read`
- Knowledge graph tools: `mempalace_kg_query`, `mempalace_kg_add`, `mempalace_kg_invalidate`, `mempalace_kg_timeline`, `mempalace_kg_stats`
- Navigation/graph tools: `mempalace_traverse`, `mempalace_find_tunnels`, `mempalace_graph_stats`, `mempalace_create_tunnel`, `mempalace_list_tunnels`, `mempalace_delete_tunnel`, `mempalace_follow_tunnels`
- Local-only adaptations: `mempalace_hook_settings`, `mempalace_memories_filed_away`, `mempalace_reconnect`
- Explicitly unsupported in hosted mode: `mempalace_sync`

This MVP intentionally omits generic `search` / `fetch` aliases to avoid duplicating the primary MemPalace surface unless connector UX proves they are needed later.

## Prerequisites

- Node.js 20+
- npm 10+
- Cloudflare account with Workers, D1, R2, Vectorize, and Workers AI enabled
- `wrangler` authenticated against the target Cloudflare account

## Quick start: first deployment

This is the happy path for a new self-hosted deployment.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Choose the public base URL that ChatGPT will use. This must be the origin only; do not include `/mcp`.

   - Workers.dev example: `https://memheaven.<your-workers-subdomain>.workers.dev`
   - Custom domain example: `https://memory.example.com`

   The OAuth issuer, resource, audience, and ChatGPT connector URL must all use this same origin.

3. Create Cloudflare resources, patch `wrangler.toml`, and apply remote migrations:

   ```bash
   npm run init -- --base-url https://memheaven.<your-workers-subdomain>.workers.dev
   ```

4. Generate valid secret material:

   ```bash
   npm run secrets:generate
   ```

   Save the generated values in a password manager. Cloudflare secrets cannot be read back later.

5. Upload the generated secrets:

   ```bash
   npx wrangler secret put JWT_SIGNING_SECRET
   npx wrangler secret put TOKEN_ENCRYPTION_KEY
   npx wrangler secret put AUTH_KEY_PEPPER
   ```

6. Generate your first access key and sync `ACCESS_KEYS_JSON`:

   ```bash
   AUTH_KEY_PEPPER='<same AUTH_KEY_PEPPER value>' npm run keygen -- --tenant personal --label "Personal"
   ```

   Copy the printed `raw_key` immediately. It is shown once and is the key you paste into the OAuth consent form.

7. Validate locally, then deploy:

   ```bash
   npm run lint
   npm run typecheck
   npm test
   npm run build
   npx wrangler deploy --dry-run --outdir .tmp/wrangler-bundle
   npx wrangler deploy
   ```

8. Add the connector in ChatGPT Developer Mode:

   ```text
   https://memheaven.<your-workers-subdomain>.workers.dev/mcp
   ```

   When ChatGPT opens the authorization page, paste the `raw_key` from step 6.

## Install dependencies

```bash
npm install
```

## Bootstrap Cloudflare resources

```bash
npm run init -- --base-url https://memheaven.<your-workers-subdomain>.workers.dev
```

`npm run init` now:

- checks Wrangler authentication;
- creates or reuses the D1 database, R2 bucket, and Vectorize index defined in `wrangler.toml`;
- creates the required Vectorize metadata indexes (`tenant_id`, `wing`, `room`, `kind`);
- patches the matching `[[d1_databases]]` block in `wrangler.toml` with the real D1 `database_id`;
- patches `OAUTH_ISSUER`, `MCP_RESOURCE`, and `MCP_AUDIENCE` when `--base-url` is provided;
- applies remote D1 migrations by default.

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

All three are generated as 32-byte base64url strings, which satisfies the app's validation rules.

Store them with Wrangler:

```bash
npx wrangler secret put JWT_SIGNING_SECRET
npx wrangler secret put TOKEN_ENCRYPTION_KEY
npx wrangler secret put AUTH_KEY_PEPPER
```

Generate an access key and automatically maintain the local git-ignored key store plus the Cloudflare `ACCESS_KEYS_JSON` secret:

```bash
AUTH_KEY_PEPPER='<same AUTH_KEY_PEPPER value>' npm run keygen -- --tenant personal --label "Personal"
```

By default this command:

- appends the new hashed key record into `.tmp/access-keys.json`;
- uploads the full merged JSON array to the Worker secret `ACCESS_KEYS_JSON` using `npx wrangler secret put`;
- prints the new raw key once so you can paste it into ChatGPT.

The command prints:

- `raw_key` — give this to the human who should authorize;
- `access_key_record` — the hashed record that was appended to the local key store;
- `access_keys_file` — the local git-ignored file that now contains the full hashed record set.

If you only want to update the local git-ignored file without touching Cloudflare yet:

```bash
AUTH_KEY_PEPPER='<same AUTH_KEY_PEPPER value>' npm run keygen -- --tenant personal --label "Personal" --no-sync
```

If you want a custom local file, it must stay under `.tmp/`:

```bash
AUTH_KEY_PEPPER='<same AUTH_KEY_PEPPER value>' npm run keygen -- --tenant personal --label "Personal" --file .tmp/my-access-keys.json --no-sync
```

The local file stores only hashed records, never raw keys. Save the printed raw key somewhere safe immediately because it is not written to disk.

Recommended shape:

```json
[
  {
    "id": "personal-2026-05-13",
    "tenant_id": "personal",
    "label": "Personal",
    "hash": "<generated hash>",
    "scopes": ["memory.read", "memory.write"],
    "active": true
  }
]
```

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
AUTH_KEY_PEPPER='<same AUTH_KEY_PEPPER value>' npm run keygen -- --tenant family-member --label "Family member"
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

- `npm run init -- --base-url <public-origin>` has patched `wrangler.toml` with the right D1 id and OAuth/MCP URLs.
- `JWT_SIGNING_SECRET`, `TOKEN_ENCRYPTION_KEY`, `AUTH_KEY_PEPPER`, and `ACCESS_KEYS_JSON` are set with `npx wrangler secret put ...`.
- The connector URL you plan to enter in ChatGPT is exactly `<public-origin>/mcp`.

```bash
npx wrangler deploy --dry-run --outdir .tmp/wrangler-bundle
npx wrangler deploy
```

Your ChatGPT connector URL is:

```text
https://memory.example.com/mcp
```

## ChatGPT Developer Mode setup

1. Add the connector using `https://memory.example.com/mcp` or your workers.dev `/mcp` URL.
2. ChatGPT performs OAuth discovery and dynamic client registration automatically.
3. On `/authorize`, enter a valid `raw_key` printed by `npm run keygen`.
4. Approve the connector.
5. ChatGPT will use bearer tokens against `/mcp`.

Success looks like ChatGPT returning from the consent page without an OAuth error and then being able to list/call tools such as `mempalace_status`.

Redirect URIs are intentionally restricted to `chatgpt.com` callback URLs and localhost for development.

## Smoke scripts

OAuth discovery smoke:

```bash
npm run smoke:oauth -- --base https://your-domain.example
```

Authenticated MCP smoke:

```bash
npm run smoke:mcp -- --base https://your-domain.example --token <bearer-token>
```

Vector metadata reindex helper:

```bash
npm run reindex -- --base https://your-domain.example --token <bearer-token> --dry-run
npm run reindex -- --base https://your-domain.example --token <bearer-token>
```

Use the reindex helper if you created Vectorize metadata indexes after data had already been embedded and inserted.

## Troubleshooting

- `401 invalid_token` on `/mcp`: token expired, key was removed, or the bearer token is missing.
- `authorization failed` / `wrong key`: make sure the raw key was generated with the same `AUTH_KEY_PEPPER` that is deployed as the Worker secret, and that `npm run keygen` synced the latest `ACCESS_KEYS_JSON`.
- `406 Not Acceptable` on `/mcp`: the client must send `Accept: application/json, text/event-stream`.
- `503` from `/health`: a required secret or binding is missing or invalid.
- `Quota exceeded`: wait for UTC reset or raise the configured per-tenant limits.
- Search/index issues after metadata-index rollout: rerun `npm run reindex ...`.
- Local browser OAuth on `http://127.0.0.1`/`localhost`: the `/authorize` CSRF cookie is intentionally non-Secure in local HTTP mode so the browser can return it on consent POST.
- Immediate post-write semantic search may briefly return empty while Vectorize finishes indexing; retry shortly if a newly added drawer is not yet searchable.
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
- Stateless OAuth means authorization codes are short-lived but not strictly one-time-use without durable server state.
- Refresh tokens are revoked by access-key removal, not individual refresh-token storage.
- Embeddings use `@cf/baai/bge-small-en-v1.5`, so long drawer bodies are chunked before indexing.
- Vectorize dimensions are locked to the configured index (`384` for the default MVP setup).

## Related docs

- `docs/PRODUCT_REQUIREMENTS.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/PROJECT_STATE.md`
- `docs/DECISIONS.md`
- `CONTINUE.md`

## License

MIT. See `LICENSE`.
