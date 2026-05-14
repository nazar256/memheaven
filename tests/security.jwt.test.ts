import { describe, expect, it } from 'vitest';

import { requireConfig } from '../src/config';
import { handleAuthorizeGet, handleAuthorizePost } from '../src/oauth/authorize';
import { handleToken, verifyAccessToken } from '../src/oauth/token';
import { aesGcmDecrypt, aesGcmEncrypt } from '../src/security/crypto';
import { signJwt, verifyJwt } from '../src/security/jwt';
import { deriveClientId } from '../src/security/validators';
import { createEnvWithKeys, RAW_KEY_A } from './helpers/testData';

const redirectUri = 'https://chatgpt.com/connector_platform_oauth_redirect';
const validChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const validVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

async function issueAccessToken(env: Awaited<ReturnType<typeof createEnvWithKeys>>) {
  const config = requireConfig(env);
  const clientId = await deriveClientId(config.issuer, redirectUri);
  const authGet = await handleAuthorizeGet(
    new Request(`https://memory.example.com/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${validChallenge}&code_challenge_method=S256`),
    config,
  );
  const html = await authGet.text();
  const csrf = /name="csrf_token" value="([^"]+)"/.exec(html)?.[1];
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
    }),
  }), config);

  const code = new URL(authPost.headers.get('location')!).searchParams.get('code')!;
  const tokenResponse = await handleToken(new Request('https://memory.example.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: validVerifier,
      client_id: clientId,
      redirect_uri: redirectUri,
    }),
  }), config);

  return {
    config,
    token: (await tokenResponse.json() as { access_token: string }).access_token,
  };
}

describe('jwt and crypto security', async () => {
  it('rejects AES-GCM payloads with wrong key or additional data', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const ciphertext = await aesGcmEncrypt(config.tokenEncryptionKeyBytes, 'secret payload', 'aad');

    await expect(aesGcmDecrypt(config.tokenEncryptionKeyBytes, ciphertext, 'wrong-aad')).rejects.toThrow();
    await expect(aesGcmDecrypt(new Uint8Array(32).fill(7), ciphertext, 'aad')).rejects.toThrow();
  });

  it('rejects JWTs with wrong issuer, audience, or type', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const issuedAt = Math.floor(Date.now() / 1000);
    const token = await signJwt(config.jwtSigningKeyBytes, 'access-token+jwt', {
      iss: config.issuer,
      aud: config.mcpAudience,
      iat: issuedAt,
      exp: issuedAt + 3600,
      jti: 'jwt-test',
      type: 'access_token',
    });

    await expect(verifyJwt(config.jwtSigningKeyBytes, token, { issuer: 'https://other.example.com', audience: config.mcpAudience, type: 'access_token' })).rejects.toThrow('Invalid JWT issuer');
    await expect(verifyJwt(config.jwtSigningKeyBytes, token, { issuer: config.issuer, audience: 'https://other.example.com/mcp', type: 'access_token' })).rejects.toThrow('Invalid JWT audience');
    await expect(verifyJwt(config.jwtSigningKeyBytes, token, { issuer: config.issuer, audience: config.mcpAudience, type: 'refresh_token' })).rejects.toThrow('Invalid JWT type');
  });

  it('does not echo raw access keys in authorization failures and rejects tampered access token types', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const clientId = await deriveClientId(config.issuer, redirectUri);
    const authGet = await handleAuthorizeGet(
      new Request(`https://memory.example.com/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${validChallenge}&code_challenge_method=S256`),
      config,
    );
    const html = await authGet.text();
    const csrf = /name="csrf_token" value="([^"]+)"/.exec(html)?.[1];
    const invalid = await handleAuthorizePost(new Request('https://memory.example.com/authorize', {
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
        access_key: 'totally-secret-raw-key',
      }),
    }), config);
    const invalidText = await invalid.text();
    expect(invalidText).toContain('Access key is invalid or inactive');
    expect(invalidText).not.toContain('totally-secret-raw-key');

    const { token } = await issueAccessToken(env);
    const claims = token.split('.');
    const payload = JSON.parse(Buffer.from(claims[1]!, 'base64url').toString('utf8')) as Record<string, unknown>;
    payload.type = 'refresh_token';
    const tampered = await signJwt(config.jwtSigningKeyBytes, 'access-token+jwt', payload as never);
    await expect(verifyAccessToken(config, tampered)).rejects.toThrow('Invalid JWT type');
  });
});
