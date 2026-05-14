import type { AppConfig } from '../config';
import { randomBase64Url } from '../utils/ids';
import { signJwt, verifyJwt } from './jwt';

interface CsrfPayload {
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
  type: 'csrf';
  client_id: string;
  redirect_uri: string;
  [key: string]: unknown;
}

export async function issueCsrfToken(config: AppConfig, clientId: string, redirectUri: string): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: CsrfPayload = {
    iss: config.issuer,
    aud: config.mcpAudience,
    iat: issuedAt,
    exp: issuedAt + 600,
    jti: randomBase64Url(12),
    type: 'csrf',
    client_id: clientId,
    redirect_uri: redirectUri,
  };
  return signJwt(config.jwtSigningKeyBytes, 'csrf+jwt', payload);
}

export async function verifyCsrfToken(
  config: AppConfig,
  token: string,
  clientId: string,
  redirectUri: string,
): Promise<void> {
  const payload = await verifyJwt<CsrfPayload>(config.jwtSigningKeyBytes, token, {
    issuer: config.issuer,
    audience: config.mcpAudience,
    type: 'csrf',
  });
  if (payload.client_id !== clientId || payload.redirect_uri !== redirectUri) {
    throw new Error('Invalid CSRF token context');
  }
}
