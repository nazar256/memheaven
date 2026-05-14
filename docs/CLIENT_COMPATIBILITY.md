# Client compatibility

MemHeaven speaks remote MCP over **Streamable HTTP** and uses OAuth with PKCE. That makes it broadly compatible in principle, but **client-specific callback rules and auth expectations still matter**.

## Important current default

The current repository defaults are **ChatGPT-first**:

- ChatGPT callback URLs are allowed
- localhost / `127.0.0.1` loopback callbacks are allowed for local development and CLI-style OAuth flows
- other hosted callback patterns are **not enabled by default** yet

That means the matrix below distinguishes between:

- **Confirmed**: directly tested end-to-end with the launch-ready target configuration
- **Expected**: protocol-compatible and likely to work, but not fully verified end-to-end here
- **Experimental**: some evidence exists, but callback/OAuth details still need a real test
- **Unknown**: not enough reliable public information yet
- **Unsupported**: not a target right now

## Matrix

| Client | Transport | Auth | OAuth callback / redirect notes | Status | Setup docs | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| ChatGPT Apps / custom MCP apps | Streamable HTTP | OAuth 2.1-style + PKCE + DCR | Hosted callbacks on `chatgpt.com`, including `https://chatgpt.com/connector/oauth/<id>` and `https://chatgpt.com/connector_platform_oauth_redirect` | **Expected** | [README](../README.md#chatgpt-setup) | This is the primary hosted-client target, but it should be re-verified end-to-end against the final public `/mcp` URL before broad launch claims. |
| Claude.ai remote connectors | Remote MCP over HTTP | OAuth + PKCE + DCR or CIMD | `https://claude.ai/api/mcp/auth_callback` | **Expected** | [Anthropic custom connectors guide](https://support.anthropic.com/en/articles/11175166-about-custom-integrations-using-remote-mcp) | Protocol-compatible, but current MemHeaven defaults do not pre-allowlist Claude's hosted callback. Expand redirect support carefully first. |
| Claude Desktop remote connectors | Remote MCP over HTTP | OAuth + PKCE + DCR or CIMD | Same hosted callback path as Claude account-level connectors | **Expected** | [Anthropic custom connectors guide](https://support.anthropic.com/en/articles/11175166-about-custom-integrations-using-remote-mcp) | Remote connectors are brokered through Anthropic's cloud; treat like Claude.ai for callback policy. |
| Claude Code | Streamable HTTP | OAuth + PKCE + DCR/CIMD or explicit client config | Loopback callbacks such as `http://127.0.0.1:<port>/callback` or `http://localhost:<port>/callback` | **Expected** | [Claude Code MCP docs](https://code.claude.com/docs/claude-code/mcp) | MemHeaven already allows localhost loopback callbacks. End-to-end verification is still recommended. |
| Cursor | Streamable HTTP | OAuth | `cursor://anysphere.cursor-mcp/oauth/callback` | **Experimental** | Verify current Cursor MCP docs before rollout | Do not enable the broad `cursor://.*` scheme. Allow only the exact callback if you decide to support it. |
| VS Code / GitHub Copilot MCP | HTTP MCP / Streamable HTTP-style remote server support | OAuth / DCR | `https://vscode.dev/redirect`, possibly `https://insiders.vscode.dev/redirect`; local/workspace configs may also use loopback for some flows | **Experimental** | [VS Code MCP docs](https://code.visualstudio.com/docs/copilot/customization/mcp-servers) | VS Code clearly supports MCP, but MemHeaven's current hosted callback allowlist does not include VS Code web redirects by default. |
| Windsurf | Likely remote HTTP | Likely OAuth | Public callback contract not verified | **Unknown** | Verify current Windsurf MCP docs | Do not pre-allowlist until callback behavior is documented. |
| Cline | Likely remote HTTP | Likely OAuth or token-based | Public callback contract not verified | **Unknown** | Verify current Cline docs | MCP support exists in the ecosystem, but hosted OAuth details are not confidently documented here. |
| Roo Code | Unknown / evolving | Unknown | Public callback contract not verified | **Unknown** | Verify current Roo Code docs | Treat as unknown until a concrete remote OAuth pattern is documented. |
| Gemini CLI | MCP support not verified for hosted OAuth use here | Unknown | No documented hosted callback pattern confirmed here | **Unknown** | Verify current Gemini CLI docs | Do not market as supported yet. |
| OpenCode | MCP-capable environment, but hosted OAuth contract not verified here | Unknown | No public hosted callback contract confirmed here | **Unknown** | Verify current OpenCode docs | Good candidate for experimentation, but not a confirmed hosted-client target yet. |
| Grok / xAI | Unknown | Unknown | No documented remote MCP callback contract confirmed here | **Unknown** | Verify current xAI docs | Do not claim support until docs and a live test exist. |

## Recommended redirect allowlist when you expand beyond ChatGPT

If you broaden callback support, start from this **narrow** allowlist:

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

Warnings:

- do **not** allow broad `https://chatgpt.com/.*`
- do **not** allow broad `https://claude.ai/.*`
- do **not** allow broad custom schemes like `cursor://.*`
- do **not** pre-allowlist clients with undocumented callback contracts

## Practical recommendation

For public launch, lead with:

1. **ChatGPT** as the primary hosted-client target, pending final end-to-end launch verification
2. **Claude Code / localhost-loopback clients** as the first additional target to verify
3. **Claude.ai / Claude Desktop remote connectors** after adding the exact callback allowlist entries above

Everything else should remain experimental or unknown until tested.
