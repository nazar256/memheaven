# Getting started from zero

This guide is for a technical user who is comfortable in a terminal but is **not** a Cloudflare expert.

Goal: deploy MemHeaven once, connect a hosted AI client, store a harmless test memory, and confirm it survives into a new chat.

## What the pieces are

- **Worker**: the HTTP service that exposes `/mcp`, OAuth, and health endpoints
- **D1**: the relational metadata/index database
- **R2**: object storage for full drawer and diary bodies
- **Vectorize**: the vector index for semantic search
- **Workers AI**: the embedding service used before vector search
- **Secrets**: private runtime configuration such as signing keys and access-key records

## Before you start

You will need:

- a Cloudflare account
- Node.js 20+ and npm 10+
- Git
- a public URL for the Worker (workers.dev is fine to start)

Helpful links:

- [Cloudflare Workers getting started](https://developers.cloudflare.com/workers/get-started/guide/)
- [Wrangler login](https://developers.cloudflare.com/workers/wrangler/commands/general/#login)
- [Cloudflare Workers pricing and limits](https://developers.cloudflare.com/workers/platform/pricing/)
- [Anthropic remote MCP custom connectors](https://support.anthropic.com/en/articles/11175166-about-custom-integrations-using-remote-mcp)
- [Claude Code MCP docs](https://code.claude.com/docs/claude-code/mcp)

> Note: ChatGPT setup is supported and documented in this repo, but a stable public OpenAI help/doc URL for custom MCP setup should be rechecked at launch time.

## 1. Create a Cloudflare account

If you do not already have one, create an account at Cloudflare and make sure you can access Workers from the dashboard.

## 2. Install Node.js and npm

Install Node.js 20 or later.

Check your versions:

```bash
node -v
npm -v
```

## 3. Install and authenticate Wrangler

You can either rely on the local project dependency with `npx wrangler ...` or install Wrangler globally if you prefer.

Authenticate:

```bash
npx wrangler login
```

Verify auth:

```bash
npx wrangler whoami
```

## 4. Clone the repo

```bash
git clone https://github.com/nazar256/memheaven.git
cd memheaven
```

## 5. Install dependencies

```bash
npm install
```

## 6. Choose the public base URL

Choose the public origin that clients will use.

Examples:

- `https://memheaven.<your-workers-subdomain>.workers.dev`
- `https://memory.example.com`

Important:

- use the **origin only** here
- do **not** include `/mcp`
- your OAuth issuer, resource, audience, and connector URL must all line up with this same base URL

## 7. Create the Cloudflare resources and patch config

Run:

```bash
npm run init -- --base-url https://memheaven.<your-workers-subdomain>.workers.dev
```

This command will:

- create or reuse the D1 database
- create or reuse the R2 bucket
- create or reuse the Vectorize index
- ensure the required Vectorize metadata indexes exist
- patch `wrangler.toml` with the real D1 database id
- patch the OAuth/MCP URLs in `wrangler.toml`
- apply remote D1 migrations by default

After `npm run init -- --base-url ...`, your local `wrangler.toml` may contain account-specific deployment values. Do not commit those values back to a public fork.

If you just want to see what it would do:

```bash
npm run init -- --dry-run --base-url https://memheaven.<your-workers-subdomain>.workers.dev
```

## 8. Generate secrets

Run:

```bash
npm run secrets:generate
```

This prints valid values for:

- `JWT_SIGNING_SECRET`
- `TOKEN_ENCRYPTION_KEY`
- `AUTH_KEY_PEPPER`

Save them immediately in your password manager. Cloudflare does not let you read secret values back later.

## 9. Upload secrets to Cloudflare

Paste the generated values into Wrangler one by one:

```bash
npx wrangler secret put JWT_SIGNING_SECRET
npx wrangler secret put TOKEN_ENCRYPTION_KEY
npx wrangler secret put AUTH_KEY_PEPPER
```

## 10. Create the first tenant and access key

Use the same `AUTH_KEY_PEPPER` value you just uploaded:

```bash
AUTH_KEY_PEPPER='<same AUTH_KEY_PEPPER value>' npm run keygen -- --tenant personal --label "Personal"
```

This command:

- appends the hashed record to `.tmp/access-keys.json`
- uploads the merged `ACCESS_KEYS_JSON` secret to Cloudflare by default
- prints a `raw_key` **once**

Save that `raw_key`. That is the value you paste into the authorization page later.

## 11. Deploy

```bash
npx wrangler deploy
```

## 12. Verify the deployment

Open:

```text
https://memheaven.<your-workers-subdomain>.workers.dev/health
```

You want to see:

- `ok: true`
- healthy bindings for DB, R2, AI, and Vectorize

## 13. Connect a client

Your MCP URL is:

```text
https://memheaven.<your-workers-subdomain>.workers.dev/mcp
```

### ChatGPT (confirmed path)

1. Add the MCP connector in ChatGPT using the `/mcp` URL above.
2. Let ChatGPT perform OAuth discovery and registration.
3. When the MemHeaven authorization page opens, paste the `raw_key` from step 10.
4. Finish the authorization flow.

MemHeaven's ChatGPT path has been manually verified narrowly for the `/mcp` URL, OAuth authorization flow, and a `mempalace_status` tool call. That confirms the main connector flow without implying support across every ChatGPT plan or workspace configuration.

### Claude-family hosted connectors (expected / experimental)

MemHeaven is protocol-compatible with hosted remote MCP clients, but the repository defaults are currently **ChatGPT-first**.

Before using Claude.ai or Claude Desktop remote connectors, review:

- [`docs/CLIENT_COMPATIBILITY.md`](CLIENT_COMPATIBILITY.md)
- [`docs/SECURITY.md`](SECURITY.md)

If you expand the redirect allowlist to include Claude's callback, use the same `/mcp` URL and the same `raw_key` authorization flow.

### Claude Code (expected)

Claude Code uses loopback callbacks like `http://localhost:<port>/callback`, which MemHeaven already allows by default. Add the remote server URL in Claude Code and complete the browser-based OAuth flow when prompted.

## 14. Call `mempalace_status`

In your connected client, ask it to call:

```text
mempalace_status
```

This should confirm:

- the server is reachable
- the tool surface is available
- the memory protocol instructions are visible to the client

## 15. Store a harmless test memory

Add a short drawer such as:

```text
I prefer dark mode in code editors.
```

Then search for it.

## 16. Start a new chat and verify recall

In a new chat/session, ask the client something like:

```text
Do you remember my editor preference?
```

The ideal behavior is:

1. the client searches MemHeaven first
2. it finds the test drawer
3. it answers using that memory

## 17. Add another tenant later

For a second person or memory space:

```bash
AUTH_KEY_PEPPER='<same AUTH_KEY_PEPPER value>' npm run keygen -- --tenant friend --label "Friend"
```

Give that person only their own new `raw_key`.

MemHeaven is designed for personal use, family, friends, and other small trusted groups. It is not marketed as enterprise-grade multi-tenant infrastructure.

## Common pitfalls

- Wrong key on authorize page: your `raw_key` and deployed `AUTH_KEY_PEPPER` likely do not match
- `406 Not Acceptable` from `/mcp`: the client must send `Accept: application/json, text/event-stream`
- Missing health bindings: rerun `npm run init` and verify secrets are uploaded
- ChatGPT works but another hosted client does not: review the redirect allowlist guidance before broadening support

## Next reads

- [Client compatibility matrix](CLIENT_COMPATIBILITY.md)
- [Agent memory protocol](AGENT_MEMORY_PROTOCOL.md)
- [Security model](SECURITY.md)
- [Launch checklist](LAUNCH.md)
