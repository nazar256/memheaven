import { describe, expect, it } from 'vitest';

import { handleRegister } from '../src/oauth/register';
import { handleAuthorizeGet, handleAuthorizePost } from '../src/oauth/authorize';
import { handleToken, verifyAccessToken } from '../src/oauth/token';
import { requireConfig } from '../src/config';
import { deriveClientId } from '../src/security/validators';
import { createEnvWithKeys, RAW_KEY_A } from './helpers/testData';

const redirectUri = 'https://chatgpt.com/connector_platform_oauth_redirect';
const validChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const validVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

async function issueAuthorizePage(config: ReturnType<typeof requireConfig>, clientId: string) {
  const authGet = await handleAuthorizeGet(
    new Request(`https://memory.example.com/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${validChallenge}&code_challenge_method=S256`),
    config,
  );
  const cookie = authGet.headers.get('set-cookie');
  const html = await authGet.text();
  const csrf = /name="csrf_token" value="([^"]+)"/.exec(html)?.[1];
  return { authGet, cookie, csrf, html };
}

describe('oauth flow', async () => {
  it('registers documented hosted and loopback redirects and rejects bad redirect contracts', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const allowedRedirects = [
      redirectUri,
      'https://chatgpt.com/connector/oauth/test-client',
      'https://chatgpt.com/connector/oauth/Az_09-test',
      'https://claude.ai/api/mcp/auth_callback',
      'http://localhost:8787/callback',
      'http://127.0.0.1:33418/callback',
      'http://[::1]:4312/callback',
    ];

    for (const allowedRedirect of allowedRedirects) {
      const ok = await handleRegister(new Request('https://memory.example.com/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ redirect_uris: [allowedRedirect] }),
      }), config);
      expect(ok.status, allowedRedirect).toBe(201);
    }

    const rejectedRedirects = [
      'https://evil.example.com/callback',
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

    for (const rejectedRedirect of rejectedRedirects) {
      const bad = await handleRegister(new Request('https://memory.example.com/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ redirect_uris: [rejectedRedirect] }),
      }), config);
      expect(bad.status, rejectedRedirect).toBe(400);
    }
  });

  it('returns a safe 503 when token endpoint has no DB binding', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const response = await handleToken(new Request('https://memory.example.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: 'x', client_id: 'y' }),
    }), config, undefined as never);

    expect(response.status).toBe(503);
    const body = await response.json() as { error: string };
    expect(body.error).toBe('server_error');
  });

  it('rejects removed keys during refresh token exchange', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const clientId = await deriveClientId(config.issuer, redirectUri);
    const { csrf } = await issueAuthorizePage(config, clientId);

    const authPost = await handleAuthorizePost(new Request('https://memory.example.com/authorize', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: `${config.csrfCookieName}=${csrf}`,
      },
      body: new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        code_challenge: validChallenge,
        code_challenge_method: 'S256',
        csrf_token: csrf!,
        access_key: RAW_KEY_A,
        duration_days: '30',
      }),
    }), config);

    const code = new URL(authPost.headers.get('location')!).searchParams.get('code');
    const tokenResponse = await handleToken(new Request('https://memory.example.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code!,
        code_verifier: validVerifier,
        client_id: clientId,
        redirect_uri: redirectUri,
      }),
    }), config, env.DB!);
    const tokenBody = await tokenResponse.json() as { refresh_token: string };

    env.ACCESS_KEYS_JSON = JSON.stringify([
      {
        id: 'tenant-a-key',
        tenant_id: 'tenant-a',
        label: 'Tenant A',
        hash: config.accessKeys[0]!.hash,
        scopes: ['memory.read', 'memory.write'],
        active: false,
      },
      config.accessKeys[1],
    ]);

    const removedKeyRefresh = await handleToken(new Request('https://memory.example.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokenBody.refresh_token,
        client_id: clientId,
      }),
    }), requireConfig(env), env.DB!);

    expect(removedKeyRefresh.status).toBe(400);
    const removedKeyBody = await removedKeyRefresh.json() as { error_description: string };
    expect(removedKeyBody.error_description).toBe('The provided grant is invalid or expired');
  });

  it('narrows refreshed token scopes to the currently active key scopes', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const clientId = await deriveClientId(config.issuer, redirectUri);
    const { csrf } = await issueAuthorizePage(config, clientId);

    const authPost = await handleAuthorizePost(new Request('https://memory.example.com/authorize', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: `${config.csrfCookieName}=${csrf}`,
      },
      body: new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        code_challenge: validChallenge,
        code_challenge_method: 'S256',
        csrf_token: csrf!,
        access_key: RAW_KEY_A,
        duration_days: '30',
      }),
    }), config);

    const code = new URL(authPost.headers.get('location')!).searchParams.get('code');
    const tokenResponse = await handleToken(new Request('https://memory.example.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code!,
        code_verifier: validVerifier,
        client_id: clientId,
        redirect_uri: redirectUri,
      }),
    }), config, env.DB!);
    const tokenBody = await tokenResponse.json() as { refresh_token: string };

    env.ACCESS_KEYS_JSON = JSON.stringify([
      {
        id: 'tenant-a-key',
        tenant_id: 'tenant-a',
        label: 'Tenant A narrowed',
        hash: config.accessKeys[0]!.hash,
        scopes: ['memory.read'],
        active: true,
      },
      config.accessKeys[1],
    ]);

    const refreshed = await handleToken(new Request('https://memory.example.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokenBody.refresh_token,
        client_id: clientId,
      }),
    }), requireConfig(env), env.DB!);

    expect(refreshed.status).toBe(200);
    const refreshedBody = await refreshed.json() as { access_token: string; refresh_token: string; scope: string };
    expect(refreshedBody.scope).toBe('memory.read');
    const claims = await verifyAccessToken(requireConfig(env), refreshedBody.access_token);
    expect(claims.scopes).toEqual(['memory.read']);
    expect(claims.keyLabel).toBe('Tenant A narrowed');

    const secondRefresh = await handleToken(new Request('https://memory.example.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshedBody.refresh_token,
        client_id: clientId,
      }),
    }), requireConfig(env), env.DB!);
    expect(secondRefresh.status).toBe(200);
  });

  it('omits Secure on authorize CSRF cookie for local http issuer', async () => {
    const env = await createEnvWithKeys();
    env.OAUTH_ISSUER = 'http://127.0.0.1:8787';
    env.MCP_RESOURCE = 'http://127.0.0.1:8787/mcp';
    env.MCP_AUDIENCE = 'http://127.0.0.1:8787/mcp';
    const config = requireConfig(env);
    const clientId = await deriveClientId(config.issuer, redirectUri);

    const response = await handleAuthorizeGet(
      new Request(`http://127.0.0.1:8787/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${validChallenge}&code_challenge_method=S256`),
      config,
    );

    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).not.toContain('Secure');
  });

  it('runs authorize GET/POST and exchanges token with PKCE', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const clientId = await deriveClientId(config.issuer, redirectUri);
    const { authGet, cookie, csrf } = await issueAuthorizePage(config, clientId);
    expect(authGet.status).toBe(200);
    expect(cookie).toContain(config.csrfCookieName);
    expect(csrf).toBeTruthy();

    const form = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: validChallenge,
      code_challenge_method: 'S256',
      csrf_token: csrf!,
      access_key: RAW_KEY_A,
      duration_days: '30',
    });
    const authPost = await handleAuthorizePost(new Request('https://memory.example.com/authorize', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: `${config.csrfCookieName}=${csrf}`,
      },
      body: form,
    }), config);
    expect(authPost.status).toBe(302);
    const location = authPost.headers.get('location');
    expect(location).toContain('code=');
    const code = new URL(location!).searchParams.get('code');

    const tokenResponse = await handleToken(new Request('https://memory.example.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code!,
        code_verifier: validVerifier,
        client_id: clientId,
        redirect_uri: redirectUri,
      }),
    }), config, env.DB!);
    expect(tokenResponse.status).toBe(200);
    const tokenBody = await tokenResponse.json() as { access_token: string; refresh_token: string };
    const claims = await verifyAccessToken(config, tokenBody.access_token);
    expect(claims.tenantId).toBe('tenant-a');

    const refreshed = await handleToken(new Request('https://memory.example.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokenBody.refresh_token,
        client_id: clientId,
      }),
    }), config, env.DB!);
    expect(refreshed.status).toBe(200);
    const refreshedBody = await refreshed.json() as { access_token: string };
    const refreshedClaims = await verifyAccessToken(config, refreshedBody.access_token);
    expect(refreshedClaims.tenantId).toBe('tenant-a');

    const invalidPkce = await handleToken(new Request('https://memory.example.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code!,
        code_verifier: 'wrong',
        client_id: clientId,
        redirect_uri: redirectUri,
      }),
    }), config, env.DB!);
    expect(invalidPkce.status).toBe(400);
    const invalidPkceBody = await invalidPkce.json() as { error_description: string };
    expect(invalidPkceBody.error_description).toBe('The provided grant is invalid or expired');
  });

  it('rejects authorization code replay and refresh token replay with generic errors', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const clientId = await deriveClientId(config.issuer, redirectUri);
    const { csrf } = await issueAuthorizePage(config, clientId);

    const authPost = await handleAuthorizePost(new Request('https://memory.example.com/authorize', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: `${config.csrfCookieName}=${csrf}`,
      },
      body: new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        code_challenge: validChallenge,
        code_challenge_method: 'S256',
        csrf_token: csrf!,
        access_key: RAW_KEY_A,
        duration_days: '30',
      }),
    }), config);

    const code = new URL(authPost.headers.get('location')!).searchParams.get('code');
    const tokenResponse = await handleToken(new Request('https://memory.example.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code!,
        code_verifier: validVerifier,
        client_id: clientId,
        redirect_uri: redirectUri,
      }),
    }), config, env.DB!);
    expect(tokenResponse.status).toBe(200);
    const tokenBody = await tokenResponse.json() as { refresh_token: string };

    const replayedCode = await handleToken(new Request('https://memory.example.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code!,
        code_verifier: validVerifier,
        client_id: clientId,
        redirect_uri: redirectUri,
      }),
    }), config, env.DB!);
    expect(replayedCode.status).toBe(400);
    expect((await replayedCode.json() as { error_description: string }).error_description).toBe('Authorization code is invalid or expired');

    const firstRefresh = await handleToken(new Request('https://memory.example.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokenBody.refresh_token,
        client_id: clientId,
      }),
    }), config, env.DB!);
    expect(firstRefresh.status).toBe(200);

    const replayedRefresh = await handleToken(new Request('https://memory.example.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokenBody.refresh_token,
        client_id: clientId,
      }),
    }), config, env.DB!);
    expect(replayedRefresh.status).toBe(400);
    expect((await replayedRefresh.json() as { error_description: string }).error_description).toBe('Refresh token is invalid or expired');
  });

  it('rejects bad csrf and invalid keys', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const clientId = await deriveClientId(config.issuer, redirectUri);
    const badCsrf = await handleAuthorizePost(new Request('https://memory.example.com/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: `${config.csrfCookieName}=cookie-token` },
      body: new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        code_challenge: validChallenge,
        code_challenge_method: 'S256',
        csrf_token: 'body-token',
        access_key: RAW_KEY_A,
      }),
    }), config);
    expect(await badCsrf.text()).toContain('CSRF validation failed');

    const { csrf } = await issueAuthorizePage(config, clientId);

    const invalidKey = await handleAuthorizePost(new Request('https://memory.example.com/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: `${config.csrfCookieName}=${csrf}` },
      body: new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        code_challenge: validChallenge,
        code_challenge_method: 'S256',
        csrf_token: csrf!,
        access_key: 'wrong-key',
      }),
    }), config);
    expect(await invalidKey.text()).toContain('Access key is invalid or inactive');
  });
});
