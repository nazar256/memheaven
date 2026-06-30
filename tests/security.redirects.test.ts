import { describe, expect, it } from 'vitest';

import { canonicalizeRedirectUri, isAllowedRedirectUri } from '../src/security/validators';

describe('redirect URI allowlist', () => {
  it('allows documented hosted callbacks and generic loopback redirects', () => {
    const allowed = [
      'https://chatgpt.com/connector_platform_oauth_redirect',
      'https://chatgpt.com/connector/oauth/test-client',
      'https://chatgpt.com/connector/oauth/Az_09-test',
      'https://claude.ai/api/mcp/auth_callback',
      'http://localhost:8787/callback',
      'http://127.0.0.1:33418/callback',
      'http://[::1]:4312/callback',
    ];

    for (const redirectUri of allowed) {
      expect(isAllowedRedirectUri(canonicalizeRedirectUri(redirectUri)), redirectUri).toBe(true);
    }
  });

  it('rejects lookalikes, extra paths, and undocumented hosted domains', () => {
    const rejected = [
      'https://chatgpt.com.evil.com/connector_platform_oauth_redirect',
      'https://claude.ai.evil.com/api/mcp/auth_callback',
      'https://vscode.dev/redirect',
      'https://vscode.dev/evil',
      'https://claude.ai/api/mcp/auth_callback/extra',
      'https://chatgpt.com/connector_platform_oauth_redirect/extra',
      'https://chatgpt.com/connector/oauth/test-client/evil',
      'https://grok.com/oauth/callback',
      'https://api.x.ai/oauth/callback',
      'https://x.ai/oauth/callback',
      'https://perplexity.ai/oauth/callback',
      'https://abacus.ai/oauth/callback',
      'https://chatgpt.com@evil.com/callback',
      'https://evil.com/callback#https://chatgpt.com/connector_platform_oauth_redirect',
    ];

    for (const redirectUri of rejected) {
      expect(isAllowedRedirectUri(canonicalizeRedirectUri(redirectUri)), redirectUri).toBe(false);
    }
  });
});
