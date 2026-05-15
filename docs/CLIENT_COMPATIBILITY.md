# Client compatibility

MemHeaven speaks remote MCP over **Streamable HTTP** and uses OAuth with PKCE. That makes it broadly compatible in principle, but **client-specific callback rules and auth expectations still matter**.

## Important current default

The current repository keeps redirect support narrow and contract-driven:

- ChatGPT hosted callback URLs are allowed
- Claude's documented hosted callback `https://claude.ai/api/mcp/auth_callback` is allowed
- VS Code's documented callbacks `https://vscode.dev/redirect` and `http://127.0.0.1:33418` are allowed
- localhost / `127.0.0.1` loopback callbacks remain allowed for local development and CLI-style OAuth flows
- other hosted callback patterns are **not enabled by default**

Callback allowlist decisions are contract-driven, not brand-driven.

That means the matrix below distinguishes between:

- **Confirmed**: directly tested end-to-end in this repository
- **Expected**: protocol-compatible and likely to work, but not fully verified end-to-end here
- **Experimental**: some evidence exists, but callback/OAuth details still need a real test
- **Unknown**: not enough reliable public information yet
- **Unsupported**: not a target right now

## Matrix

| Client | Transport | Auth | OAuth callback / redirect notes | Status | Setup docs | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| ChatGPT Apps / custom MCP apps | Streamable HTTP | OAuth 2.1-style + PKCE + DCR | Hosted callbacks on `chatgpt.com`, including `https://chatgpt.com/connector/oauth/<id>` and `https://chatgpt.com/connector_platform_oauth_redirect` | **Confirmed** | [README](../README.md#chatgpt-setup) | Manually verified narrowly for the `/mcp` URL, OAuth authorization flow, and a `mempalace_status` tool call. This does not imply support across every ChatGPT plan or workspace configuration. |
| Claude.ai remote connectors | Remote MCP over HTTP | OAuth + PKCE + DCR or CIMD | `https://claude.ai/api/mcp/auth_callback` | **Expected** | [Anthropic custom connectors guide](https://support.anthropic.com/en/articles/11175166-about-custom-integrations-using-remote-mcp) | Callback contract is documented and allowlisted; end-to-end verification is still recommended. |
| Claude Desktop remote connectors | Remote MCP over HTTP | OAuth + PKCE + DCR or CIMD | Same hosted callback path as Claude account-level connectors | **Expected** | [Anthropic custom connectors guide](https://support.anthropic.com/en/articles/11175166-about-custom-integrations-using-remote-mcp) | Remote connectors are brokered through Anthropic's cloud; treat like Claude.ai for callback policy. |
| Claude Code | Streamable HTTP | OAuth + PKCE + DCR/CIMD or explicit client config | Loopback callbacks such as `http://127.0.0.1:<port>/callback` or `http://localhost:<port>/callback` | **Expected** | [Claude Code MCP docs](https://code.claude.com/docs/claude-code/mcp) | MemHeaven already allows localhost loopback callbacks. End-to-end verification is still recommended. |
| Cursor | Streamable HTTP | OAuth | No officially documented hosted OAuth callback contract confirmed here | **Experimental** | Verify current Cursor MCP docs before rollout | Do not add callback support until Cursor publishes a stable callback contract you can pin exactly. |
| VS Code / GitHub Copilot MCP | HTTP MCP / Streamable HTTP-style remote server support | OAuth / DCR | `https://vscode.dev/redirect` and `http://127.0.0.1:33418` | **Experimental** | [VS Code MCP docs](https://code.visualstudio.com/docs/copilot/customization/mcp-servers) | Callback contracts are documented and allowlisted; end-to-end verification is still needed before claiming broad support. |
| Windsurf | Likely remote HTTP | Likely OAuth | Public callback contract not verified | **Unknown** | Verify current Windsurf MCP docs | Do not pre-allowlist until callback behavior is documented. |
| Cline | Likely remote HTTP | Likely OAuth or token-based | Public callback contract not verified | **Unknown** | Verify current Cline docs | MCP support exists in the ecosystem, but hosted OAuth details are not confidently documented here. |
| Roo Code | Unknown / evolving | Unknown | Public callback contract not verified | **Unknown** | Verify current Roo Code docs | Treat as unknown until a concrete remote OAuth pattern is documented. |
| Gemini CLI | MCP support not verified for hosted OAuth use here | Unknown | No documented hosted callback pattern confirmed here | **Unknown** | Verify current Gemini CLI docs | Do not market as supported yet. |
| OpenCode | MCP-capable environment, but hosted OAuth contract not verified here | Unknown | No public hosted callback contract confirmed here | **Unknown** | Verify current OpenCode docs | Good candidate for experimentation, but not a confirmed hosted-client target yet. |
| Grok / xAI | Unknown | Unknown | No documented remote MCP callback contract confirmed here | **Unknown** | Verify current xAI docs | Do not claim support until docs and a live test exist. |
| Perplexity | Unknown | Unknown | No documented remote MCP callback contract confirmed here | **Unknown** | Verify current Perplexity docs | Do not claim support until docs and a live test exist. |
| Abacus | Unknown | Unknown | No documented remote MCP callback contract confirmed here | **Unknown** | Verify current Abacus docs | Do not claim support until docs and a live test exist. |

## Current documented callback allowlist

MemHeaven currently keeps hosted callback support to exact documented hosted contracts plus narrowly scoped local loopback development:

```text
^https://claude\.ai/api/mcp/auth_callback$
^https://chatgpt\.com/connector/oauth/[A-Za-z0-9_-]+$
^https://chatgpt\.com/connector_platform_oauth_redirect$
^https://vscode\.dev/redirect$
^http://127\.0\.0\.1:33418/?$
loopback http redirects on localhost / 127.0.0.1 / [::1] for local development
```

Warnings:

- do **not** allow broad `https://chatgpt.com/.*`
- do **not** allow broad `https://claude.ai/.*`
- do **not** allow broad `https://vscode.dev/.*`
- do **not** allow broad custom schemes
- do **not** pre-allowlist clients with undocumented callback contracts

## Practical recommendation

Prioritize compatibility work in this order:

1. **ChatGPT** as the confirmed hosted-client starting point
2. **Claude.ai / Claude Desktop / Claude Code** because the callback contracts are documented and narrowly allowlisted
3. **VS Code / Copilot** as the next experimental target because its documented callbacks are now allowlisted

Everything else should remain experimental or unknown until a stable callback contract and a live end-to-end test exist.
