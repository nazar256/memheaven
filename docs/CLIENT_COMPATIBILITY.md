# Client compatibility

MemHeaven speaks remote MCP over **Streamable HTTP**. Hosted OAuth clients still depend on precise redirect contracts, and non-OAuth hosts need a way to send `Authorization: Bearer <token>` to `/mcp`.

## Important current default

The current repository keeps redirect support narrow and contract-driven:

- ChatGPT hosted callback URLs are allowed
- Claude's known exact hosted callback `https://claude.ai/api/mcp/auth_callback` is allowed, but public docs do not expose the URL in article text
- generic localhost / `127.0.0.1` / `[::1]` loopback callbacks remain allowed for local IDE, CLI, and browser-based OAuth flows
- other hosted callback patterns are **not enabled by default**

Callback allowlist decisions are contract-driven, not brand-driven.

That means the matrix below distinguishes between:

- **Confirmed**: directly tested end-to-end in this repository
- **Expected**: protocol-compatible and likely to work, but not fully verified end-to-end here
- **Unknown**: not enough reliable public information yet

## Matrix

| Client | Transport | Auth | OAuth callback / redirect notes | Status | Setup docs | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| ChatGPT Apps / custom MCP apps | Streamable HTTP | OAuth 2.1-style + PKCE + DCR | Hosted callbacks on `chatgpt.com`, including `https://chatgpt.com/connector/oauth/<id>` and `https://chatgpt.com/connector_platform_oauth_redirect` | **Confirmed** | [README](../README.md#chatgpt-setup) | Manually verified narrowly for the `/mcp` URL, OAuth authorization flow, and a `mempalace_status` tool call. This does not imply support across every ChatGPT plan or workspace configuration. |
| Claude.ai hosted connectors | Remote MCP over HTTP | OAuth + PKCE + DCR or CIMD | `https://claude.ai/api/mcp/auth_callback` | **Expected** | [Anthropic custom connectors guide](https://support.anthropic.com/en/articles/11175166-about-custom-integrations-using-remote-mcp) | Current public Claude help text confirms hosted remote MCP custom connectors and OAuth setup, but does not expose the callback URL in the article text. The known exact callback is narrowly allowlisted and covered by negative redirect tests; live Claude.ai flow verification is still recommended before marking Confirmed. |
| Local IDE / CLI MCP clients | Streamable HTTP | OAuth via loopback callback | Generic loopback redirects on `http://localhost:<port>/...`, `http://127.0.0.1:<port>/...`, and `http://[::1]:<port>/...` | **Expected** | See your client's local MCP docs | Covers clients that use local browser/loopback OAuth callbacks. MemHeaven does not need brand-specific localhost logic for these. |
| VS Code / GitHub Copilot MCP | HTTP MCP / Streamable HTTP-style remote server support | Loopback OAuth or explicit client configuration / headers | No exact hosted callback contract is allowlisted. Current public VS Code MCP docs describe remote server and OAuth/header configuration but do not provide an exact hosted redirect URL for MemHeaven to pre-allow. | **Expected for local loopback; Unknown for hosted OAuth** | [VS Code MCP docs](https://code.visualstudio.com/docs/copilot/customization/mcp-servers) | Local VS Code-style flows can use generic loopback callbacks. Hosted/non-loopback VS Code OAuth should not be enabled until an exact callback contract is verified. |
| Grok / xAI | Remote MCP | Authorization header | No documented hosted OAuth callback contract. Use the MemHeaven `/mcp` URL and xAI's Remote MCP `authorization` or `headers` configuration when the host supports custom headers. | **Expected with bearer/header auth** | [xAI Remote MCP tools](https://docs.x.ai/docs/developers/tools/remote-mcp) | MemHeaven accepts OAuth access tokens as bearer tokens on `/mcp`; raw MemHeaven access keys are not bearer tokens. There is no public scripted flow yet for minting a bearer token outside the normal OAuth connector flow. |
| Perplexity | N/A as hosted MemHeaven client | N/A | Current public docs describe Perplexity as an MCP server for other clients, not as a hosted third-party remote MCP client target. | **Not applicable** | Perplexity public MCP docs | No allowlist entry. |
| Abacus | Unknown | Unknown | No exact hosted callback or bearer/header contract confirmed. | **Unknown** | Verify current Abacus docs before rollout | No allowlist entry. |

## Current documented callback allowlist

MemHeaven currently keeps hosted callback support to exact documented hosted contracts plus narrowly scoped local loopback development:

```text
^https://claude\.ai/api/mcp/auth_callback$
^https://chatgpt\.com/connector/oauth/[A-Za-z0-9_-]+$
^https://chatgpt\.com/connector_platform_oauth_redirect$
loopback http redirects on localhost / 127.0.0.1 / [::1] with any port and path for local IDE, CLI, and browser OAuth flows
```

Warnings:

- do **not** allow broad `https://chatgpt.com/.*`
- do **not** allow broad `https://claude.ai/.*`
- do **not** allow `https://vscode.dev/redirect` or broad `https://vscode.dev/.*` without an exact current callback contract
- do **not** allow broad custom schemes
- do **not** add speculative hosted OAuth domains such as `grok.com`, `x.ai`, `api.x.ai`, `perplexity.ai`, or `abacus.ai`
- do **not** pre-allowlist clients with undocumented callback contracts

## Local IDE / CLI MCP Clients

Local MCP clients are supported as a class when they use browser OAuth with a loopback callback. MemHeaven does not need a brand-specific callback rule for each local client.

Allowed local callback hosts:

```text
http://localhost:<port>/...
http://127.0.0.1:<port>/...
http://[::1]:<port>/...
```

This covers IDEs, CLIs, and local agent tools that open a browser and listen on a local callback server. It does not automatically confirm every client implementation end-to-end, and it does not justify hosted/non-loopback domains for those products.

If a local client instead runs as a hosted web app or uses a non-loopback callback domain, treat it as a hosted-client compatibility task: verify the exact callback contract first, then add one exact allowlist entry and regression tests.

## Claude.ai callback evidence

As of 2026-06-30, Anthropic's public custom connectors guide confirms that Claude supports hosted remote MCP custom connectors and that users typically authenticate through OAuth when connecting a custom connector. The public article does not list the redirect callback URL in its visible text, so MemHeaven keeps Claude.ai status at **Expected** rather than **Confirmed**.

MemHeaven allows only the known exact hosted callback:

```text
https://claude.ai/api/mcp/auth_callback
```

Regression tests reject lookalikes and path widening such as:

```text
https://claude.ai.evil.com/api/mcp/auth_callback
https://claude.ai/api/mcp/auth_callback/extra
```

## Grok / xAI bearer setup

As of 2026-06-30, xAI's Remote MCP tools docs describe a `server_url` parameter for Streaming HTTP or SSE MCP servers plus optional `authorization` and `headers` parameters that xAI sends to the MCP server. xAI's Grok connector docs also describe custom MCP connectors by server URL and required authentication.

Use this setup shape for MemHeaven:

```json
{
  "type": "mcp",
  "server_label": "memheaven",
  "server_url": "https://<your-memheaven-host>/mcp",
  "authorization": "Bearer <memheaven-oauth-access-token>"
}
```

If the host uses a generic custom header map instead of xAI's `authorization` field, send the same value as an HTTP header:

```text
Authorization: Bearer <memheaven-oauth-access-token>
```

MemHeaven validates that bearer value as an OAuth access token and derives `tenant_id` from the verified token. A raw MemHeaven access key from `npm run keygen` is only used at `/authorize` to issue OAuth tokens; it is not accepted directly as the `/mcp` bearer token.

Do not add Grok/xAI redirect domains unless an exact hosted OAuth callback contract is verified. Current regression tests intentionally reject speculative callbacks such as `https://grok.com/oauth/callback`, `https://api.x.ai/oauth/callback`, and `https://x.ai/oauth/callback`.

Current gap: the repository does not yet ship a public operator-facing token minting command for non-OAuth hosts. Until that exists, use the normal OAuth flow to obtain a MemHeaven access token, or add a narrowly scoped helper that mints a short-lived bearer token from the deployed secrets without printing unrelated secret material.

## Practical recommendation

Prioritize compatibility work in this order:

1. **ChatGPT** as the confirmed hosted-client starting point
2. **Claude.ai hosted connectors** because the known callback contract is narrowly allowlisted, pending live-flow confirmation
3. **Local IDE / CLI clients** that use loopback OAuth callbacks
4. **VS Code / Copilot** through generic local loopback first; hosted/non-loopback OAuth needs an exact callback contract before allowlisting
5. **Grok / xAI** only through explicit bearer/header support, not through new redirect allowlist entries
