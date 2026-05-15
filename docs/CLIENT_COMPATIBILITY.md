# Client compatibility

MemHeaven speaks remote MCP over **Streamable HTTP**. Hosted OAuth clients still depend on precise redirect contracts, and non-OAuth hosts need a way to send `Authorization: Bearer <token>` to `/mcp`.

## Important current default

The current repository keeps redirect support narrow and contract-driven:

- ChatGPT hosted callback URLs are allowed
- Claude's documented hosted callback `https://claude.ai/api/mcp/auth_callback` is allowed
- VS Code's documented callback `https://vscode.dev/redirect` remains allowed
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
| Claude.ai hosted connectors | Remote MCP over HTTP | OAuth + PKCE + DCR or CIMD | `https://claude.ai/api/mcp/auth_callback` | **Expected** | [Anthropic custom connectors guide](https://support.anthropic.com/en/articles/11175166-about-custom-integrations-using-remote-mcp) | Documented hosted callback is allowlisted. End-to-end verification is still recommended. |
| Local IDE / CLI MCP clients | Streamable HTTP | OAuth via loopback callback | Generic loopback redirects on `http://localhost:<port>/...`, `http://127.0.0.1:<port>/...`, and `http://[::1]:<port>/...` | **Expected** | See your client's local MCP docs | Covers clients that use local browser/loopback OAuth callbacks. MemHeaven does not need brand-specific localhost logic for these. |
| VS Code / GitHub Copilot MCP | HTTP MCP / Streamable HTTP-style remote server support | OAuth / DCR | `https://vscode.dev/redirect` | **Experimental** | [VS Code MCP docs](https://code.visualstudio.com/docs/copilot/customization/mcp-servers) | Existing documented callback remains allowlisted. No broader editor-domain expansion is enabled. |
| Grok / xAI | Remote MCP | Authorization header | No documented hosted OAuth callback contract. Use the MemHeaven `/mcp` URL and `Authorization: Bearer <token>` when the host supports custom headers. | **Expected with bearer/header auth** | xAI Remote MCP tooling docs | MemHeaven accepts bearer tokens for `/mcp`, but there is no public scripted flow yet for minting a bearer token outside the normal OAuth connector flow. |
| Perplexity | N/A as hosted MemHeaven client | N/A | Current public docs describe Perplexity as an MCP server for other clients, not as a hosted third-party remote MCP client target. | **Not applicable** | Perplexity public MCP docs | No allowlist entry. |
| Abacus | Unknown | Unknown | No exact hosted callback or bearer/header contract confirmed. | **Unknown** | Verify current Abacus docs before rollout | No allowlist entry. |

## Current documented callback allowlist

MemHeaven currently keeps hosted callback support to exact documented hosted contracts plus narrowly scoped local loopback development:

```text
^https://claude\.ai/api/mcp/auth_callback$
^https://chatgpt\.com/connector/oauth/[A-Za-z0-9_-]+$
^https://chatgpt\.com/connector_platform_oauth_redirect$
^https://vscode\.dev/redirect$
loopback http redirects on localhost / 127.0.0.1 / [::1] with any port and path for local IDE, CLI, and browser OAuth flows
```

Warnings:

- do **not** allow broad `https://chatgpt.com/.*`
- do **not** allow broad `https://claude.ai/.*`
- do **not** allow broad `https://vscode.dev/.*`
- do **not** allow broad custom schemes
- do **not** add speculative hosted OAuth domains such as `grok.com`, `x.ai`, `api.x.ai`, `perplexity.ai`, or `abacus.ai`
- do **not** pre-allowlist clients with undocumented callback contracts

## Grok / xAI note

Current public xAI Remote MCP material points to remote MCP connections that can send authorization headers. That makes Grok/xAI a bearer/header integration question, not a hosted OAuth callback allowlist question.

MemHeaven already accepts `Authorization: Bearer <token>` on `/mcp`. What is still missing is a small public operator-facing guide for minting a bearer token specifically for non-OAuth hosts.

## Practical recommendation

Prioritize compatibility work in this order:

1. **ChatGPT** as the confirmed hosted-client starting point
2. **Claude.ai hosted connectors** because the callback contract is documented and narrowly allowlisted
3. **Local IDE / CLI clients** that use loopback OAuth callbacks
4. **VS Code / Copilot** as a narrower experimental hosted target because `https://vscode.dev/redirect` is already allowlisted
5. **Grok / xAI** only through explicit bearer/header support, not through new redirect allowlist entries
