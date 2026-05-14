import type { AppConfig } from '../config';
import type { TenantAuthContext } from '../memory/types';
import { resolveActiveAccessKey } from '../security/accessKeys';
import { decryptJwtConfig, encryptJwtConfig, signJwt, verifyJwt, type JwtPayload } from '../security/jwt';
import { parseBearerToken } from '../security/validators';
import { randomBase64Url } from '../utils/ids';
import { addDays } from '../utils/time';
import { verifyPkceS256 } from './pkce';
import { jsonResponse } from './metadata';

interface EncryptedAuthConfig {
  tenant_id: string;
  key_id: string;
  key_label: string;
  scopes: string[];
  duration_days: number;
  session_expires_at: number;
  subject: string;
}

interface AuthorizationCodeClaims extends JwtPayload {
  type: 'auth_code';
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: 'S256';
  scope: string;
  resource: string;
  enc: string;
}

interface AccessTokenClaims extends JwtPayload {
  type: 'access_token';
  client_id: string;
  key_id: string;
  key_label: string;
  tenant_id: string;
  scope: string;
  sub: string;
}

interface RefreshTokenClaims extends JwtPayload {
  type: 'refresh_token';
  client_id: string;
  key_id: string;
  key_label: string;
  tenant_id: string;
  scope: string;
  sub: string;
  session_expires_at: number;
}

interface AuthorizationCodeInput {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  tenantId: string;
  keyId: string;
  keyLabel: string;
  durationDays: number;
  resource: string;
  subject: string;
}

interface TokenBundle {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

function tokenFormHeaders(): HeadersInit {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    pragma: 'no-cache',
  };
}

function unixNow(date = new Date()): number {
  return Math.floor(date.getTime() / 1000);
}

export async function issueAuthorizationCode(config: AppConfig, input: AuthorizationCodeInput): Promise<string> {
  const issuedAt = unixNow();
  const sessionExpiresAt = Math.floor(addDays(new Date(), input.durationDays).getTime() / 1000);
  const claims: AuthorizationCodeClaims = {
    iss: config.issuer,
    aud: config.mcpAudience,
    iat: issuedAt,
    exp: issuedAt + config.authCodeTtlSeconds,
    jti: randomBase64Url(12),
    type: 'auth_code',
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    code_challenge_method: 'S256',
    scope: input.scopes.join(' '),
    resource: input.resource,
    enc: '',
  };

  claims.enc = await encryptJwtConfig(config.tokenEncryptionKeyBytes, claims, {
    tenant_id: input.tenantId,
    key_id: input.keyId,
    key_label: input.keyLabel,
    scopes: input.scopes,
    duration_days: input.durationDays,
    session_expires_at: sessionExpiresAt,
    subject: input.subject,
  } satisfies EncryptedAuthConfig);

  return signJwt(config.jwtSigningKeyBytes, 'authorization-code+jwt', claims);
}

async function issueAccessToken(
  config: AppConfig,
  auth: EncryptedAuthConfig,
  clientId: string,
): Promise<{ token: string; expiresIn: number }> {
  const issuedAt = unixNow();
  const exp = Math.min(auth.session_expires_at, issuedAt + config.accessTokenTtlSeconds);
  const claims: AccessTokenClaims = {
    iss: config.issuer,
    aud: config.mcpAudience,
    iat: issuedAt,
    exp,
    jti: randomBase64Url(12),
    type: 'access_token',
    client_id: clientId,
    key_id: auth.key_id,
    key_label: auth.key_label,
    tenant_id: auth.tenant_id,
    scope: auth.scopes.join(' '),
    sub: auth.subject,
  };
  return {
    token: await signJwt(config.jwtSigningKeyBytes, 'access-token+jwt', claims),
    expiresIn: exp - issuedAt,
  };
}

async function issueRefreshToken(
  config: AppConfig,
  auth: EncryptedAuthConfig,
  clientId: string,
): Promise<string> {
  const issuedAt = unixNow();
  const claims: RefreshTokenClaims = {
    iss: config.issuer,
    aud: config.mcpAudience,
    iat: issuedAt,
    exp: auth.session_expires_at,
    jti: randomBase64Url(12),
    type: 'refresh_token',
    client_id: clientId,
    key_id: auth.key_id,
    key_label: auth.key_label,
    tenant_id: auth.tenant_id,
    scope: auth.scopes.join(' '),
    sub: auth.subject,
    session_expires_at: auth.session_expires_at,
  };
  return signJwt(config.jwtSigningKeyBytes, 'refresh-token+jwt', claims);
}

function toTokenResponse(bundle: TokenBundle): Response {
  return new Response(JSON.stringify(bundle, null, 2), { status: 200, headers: tokenFormHeaders() });
}

export async function handleToken(request: Request, config: AppConfig): Promise<Response> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/x-www-form-urlencoded')) {
    return jsonResponse({ error: 'invalid_request', error_description: 'Token requests must use application/x-www-form-urlencoded' }, 400);
  }

  const form = await request.formData();
  const grantType = String(form.get('grant_type') ?? '');

  try {
    if (grantType === 'authorization_code') {
      const code = String(form.get('code') ?? '');
      const codeVerifier = String(form.get('code_verifier') ?? '');
      const clientId = String(form.get('client_id') ?? '');
      const redirectUri = String(form.get('redirect_uri') ?? '');
      const claims = await verifyJwt<AuthorizationCodeClaims>(config.jwtSigningKeyBytes, code, {
        issuer: config.issuer,
        audience: config.mcpAudience,
        type: 'auth_code',
      });

      if (claims.client_id !== clientId || claims.redirect_uri !== redirectUri) {
        throw new Error('Authorization code client or redirect mismatch');
      }
      if (!(await verifyPkceS256(codeVerifier, claims.code_challenge))) {
        throw new Error('PKCE verification failed');
      }

      const auth = await decryptJwtConfig<EncryptedAuthConfig>(config.tokenEncryptionKeyBytes, claims, claims.enc);
      const activeKey = resolveActiveAccessKey(config, {
        keyId: auth.key_id,
        tenantId: auth.tenant_id,
        requestedScopes: auth.scopes,
      });

      const refreshedAuth: EncryptedAuthConfig = {
        ...auth,
        key_label: activeKey.record.label,
        scopes: activeKey.scopes,
      };

      const accessToken = await issueAccessToken(config, refreshedAuth, clientId);
      const refreshToken = await issueRefreshToken(config, refreshedAuth, clientId);
      return toTokenResponse({
        access_token: accessToken.token,
        token_type: 'Bearer',
        expires_in: accessToken.expiresIn,
        refresh_token: refreshToken,
        scope: refreshedAuth.scopes.join(' '),
      });
    }

    if (grantType === 'refresh_token') {
      const refreshToken = String(form.get('refresh_token') ?? '');
      const clientId = String(form.get('client_id') ?? '');
      const claims = await verifyJwt<RefreshTokenClaims>(config.jwtSigningKeyBytes, refreshToken, {
        issuer: config.issuer,
        audience: config.mcpAudience,
        type: 'refresh_token',
      });
      if (claims.client_id !== clientId) {
        throw new Error('Refresh token client mismatch');
      }
      const activeKey = resolveActiveAccessKey(config, {
        keyId: claims.key_id,
        tenantId: claims.tenant_id,
        requestedScopes: claims.scope.split(/\s+/u).filter(Boolean),
      });

      const auth: EncryptedAuthConfig = {
        tenant_id: activeKey.record.tenant_id,
        key_id: activeKey.record.id,
        key_label: activeKey.record.label,
        scopes: activeKey.scopes,
        duration_days: config.refreshTokenMaxDays,
        session_expires_at: claims.session_expires_at,
        subject: claims.sub,
      };
      const accessToken = await issueAccessToken(config, auth, clientId);
      const rotatedRefreshToken = await issueRefreshToken(config, auth, clientId);
      return toTokenResponse({
        access_token: accessToken.token,
        token_type: 'Bearer',
        expires_in: accessToken.expiresIn,
        refresh_token: rotatedRefreshToken,
        scope: auth.scopes.join(' '),
      });
    }
  } catch (error) {
    return jsonResponse(
      { error: 'invalid_grant', error_description: error instanceof Error ? error.message : String(error) },
      400,
      tokenFormHeaders(),
    );
  }

  return jsonResponse({ error: 'unsupported_grant_type' }, 400, tokenFormHeaders());
}

export async function verifyAccessToken(config: AppConfig, token: string): Promise<TenantAuthContext> {
  const claims = await verifyJwt<AccessTokenClaims>(config.jwtSigningKeyBytes, token, {
    issuer: config.issuer,
    audience: config.mcpAudience,
    type: 'access_token',
  });
  const activeKey = resolveActiveAccessKey(config, {
    keyId: claims.key_id,
    tenantId: claims.tenant_id,
    requestedScopes: claims.scope.split(/\s+/u).filter(Boolean),
  });

  return {
    tenantId: activeKey.record.tenant_id,
    keyId: activeKey.record.id,
    keyLabel: activeKey.record.label,
    clientId: claims.client_id,
    scopes: activeKey.scopes,
    tokenType: 'access_token',
    subject: claims.sub,
  };
}

export async function authenticateBearerRequest(
  request: Request,
  config: AppConfig,
): Promise<TenantAuthContext | null> {
  const token = parseBearerToken(request.headers.get('authorization'));
  if (!token) {
    return null;
  }
  return verifyAccessToken(config, token);
}
