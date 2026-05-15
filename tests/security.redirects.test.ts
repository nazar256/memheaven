import { describe, expect, it } from 'vitest';

import { canonicalizeRedirectUri, isAllowedRedirectUri } from '../src/security/validators';

describe('redirect URI allowlist', () => {
  it('allows documented ChatGPT, Claude, VS Code, and loopback callbacks', () => {
    const allowed = [
      'https://chatgpt.com/connector_platform_oauth_redirect',
      'https://chatgpt.com/connector/oauth/test-client',
      'https://claude.ai/api/mcp/auth_callback',
      'https://vscode.dev/redirect',
      'http://127.0.0.1:33418',
    ];

    for (const redirectUri of allowed) {
      expect(isAllowedRedirectUri(canonicalizeRedirectUri(redirectUri)), redirectUri).toBe(true);
    }
  });

  it('rejects lookalike and undocumented AI redirect domains', () => {
    const rejected = [
      'https://claude.ai/evil',
      'https://vscode.dev/evil',
      'https://chatgpt.com/connector/oauth/test-client/evil',
      'https://x.ai/oauth/callback',
      'https://perplexity.ai/oauth/callback',
      'https://abacus.ai/oauth/callback',
    ];

    for (const redirectUri of rejected) {
      expect(isAllowedRedirectUri(canonicalizeRedirectUri(redirectUri)), redirectUri).toBe(false);
    }
  });
});
