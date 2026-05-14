# Security model

MemHeaven is designed to make remote MCP memory practical for a single person or a small trusted group without running a VM, Docker daemon, or a manually managed database.

It is **not** positioned as enterprise-grade isolation, compliance infrastructure, or a hardened multi-organization SaaS control plane.

## What MemHeaven protects

- Unauthenticated users should not be able to browse or call `/mcp`.
- Each access key maps to exactly one `tenant_id`.
- Drawer, diary, knowledge-graph, and tunnel reads/writes are scoped to the verified tenant from the bearer token.
- Raw access keys are accepted only at the OAuth consent page and should never be stored in D1, R2, Vectorize metadata, URLs, or logs.
- Stored memory is treated as user data, not as instructions.

## Authentication model

MemHeaven uses:

- OAuth 2.1-style authorization flow
- PKCE (`S256`)
- dynamic client registration where supported
- stateless JWT authorization codes, access tokens, and refresh tokens
- an invite/access-key gate on the consent page

The human user authorizes a client by pasting a raw access key into `/authorize`. The server hashes that input with `AUTH_KEY_PEPPER`, compares it to the active records in `ACCESS_KEYS_JSON`, and issues tenant-scoped tokens only when the key matches.

### What the important secrets do

- `JWT_SIGNING_SECRET`: signs auth codes and tokens
- `TOKEN_ENCRYPTION_KEY`: encrypts sensitive token payloads
- `AUTH_KEY_PEPPER`: hashes raw access keys before comparison
- `ACCESS_KEYS_JSON`: the active, hashed key records used to map users to tenants and scopes

If you rotate `AUTH_KEY_PEPPER`, all previously generated raw access keys stop working and must be regenerated.

## Multi-tenancy, honestly described

MemHeaven supports multi-tenancy for:

- your own separate memory contexts
- family members
- friends
- small trusted groups

It does **not** claim enterprise tenant isolation. The intended trust model is a single operator running one deployment for a small set of trusted users.

## Storage model

- **D1** stores metadata, indexes, KG facts, tunnels, quota counters, and audit metadata.
- **R2** stores full drawer and diary bodies verbatim.
- **Vectorize** stores chunk embeddings for semantic search.
- **Workers AI** generates embeddings.

Every storage layer is tenant-scoped:

- D1 rows include `tenant_id`
- R2 keys are prefixed with `tenants/{tenant_id}/...`
- Vectorize queries are filtered by `tenant_id`
- Vectorize hits are checked against D1 again before content is returned

## Recommended redirect allowlist

The current MemHeaven repo defaults are intentionally conservative: ChatGPT callback URLs plus localhost loopback callbacks for development and CLI-style OAuth flows.

If you expand redirect support for additional MCP clients, prefer a **narrow allowlist** like this:

```text
^https://claude\.ai/api/mcp/auth_callback$
^https://chatgpt\.com/connector/oauth/[A-Za-z0-9_-]+$
^https://chatgpt\.com/connector_platform_oauth_redirect$
^cursor://anysphere\.cursor-mcp/oauth/callback$
^http://127\.0\.0\.1(?::\d+)?/callback$
^http://localhost(?::\d+)?/callback$
^http://127\.0\.0\.1(?::\d+)?/?$
^https://vscode\.dev/redirect$
^https://insiders\.vscode\.dev/redirect$
```

### Do not do this

- Do **not** allow broad `https://chatgpt.com/.*`
- Do **not** allow broad `https://claude.ai/.*`
- Do **not** allow broad custom schemes such as `cursor://.*`
- Do **not** pre-allowlist clients with undocumented callback contracts

## Threat model notes

### Prompt injection and memory poisoning

Stored memory can contain attacker-controlled text. Treat retrieved memory as context to inspect, not instructions to obey.

### Small-trust-group assumptions

The project is designed for one operator and a small number of trusted users. If you need strong blast-radius reduction between unrelated organizations, separate deployments are safer than one shared deployment.

### Stateless OAuth tradeoffs

- auth codes are short-lived, but not strictly one-time-use without durable state
- refresh tokens are revoked at the access-key level, not individually
- removing or deactivating a key invalidates future token checks for that key

## Operational advice

- Use `npm run secrets:generate` for valid key material
- Use `npm run keygen` so key records are hashed and synced consistently
- Verify `/health` after deploy before connecting a client
- Keep logs, screenshots, and bug reports free of raw keys and bearer tokens
- Review [`docs/CLIENT_COMPATIBILITY.md`](CLIENT_COMPATIBILITY.md) before enabling new hosted clients
