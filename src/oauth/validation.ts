import type { AppConfig } from '../config';
import { canonicalizeRedirectUri, isAllowedRedirectUri, validateClientIdentity } from '../security/validators';

export interface OAuthAuthorizeParams {
  responseType: string;
  clientId: string;
  redirectUri: string;
  state: string | null;
  scope: string | null;
  resource: string | null;
  codeChallenge: string;
  codeChallengeMethod: string;
}

export function parseScopes(config: AppConfig, scope: string | null | undefined, keyScopes?: string[]): string[] {
  const requested = (scope ?? '')
    .split(/\s+/u)
    .map((item) => item.trim())
    .filter(Boolean);
  const allowed = new Set(keyScopes ?? config.supportedScopes);
  const chosen = (requested.length > 0 ? requested : Array.from(allowed)).filter(
    (item) => allowed.has(item) && config.supportedScopes.includes(item),
  );
  if (chosen.length === 0) {
    throw new Error('No supported scopes were requested');
  }
  return chosen;
}

export async function validateAuthorizeParams(
  config: AppConfig,
  params: OAuthAuthorizeParams,
): Promise<OAuthAuthorizeParams> {
  if (params.responseType !== 'code') {
    throw new Error('response_type must be code');
  }

  const canonicalRedirectUri = canonicalizeRedirectUri(params.redirectUri);
  if (!isAllowedRedirectUri(canonicalRedirectUri)) {
    throw new Error('redirect_uri is not allowed');
  }

  await validateClientIdentity(config, params.clientId, canonicalRedirectUri);

  if (params.resource && params.resource !== config.mcpResource && params.resource !== config.mcpAudience) {
    throw new Error('resource does not match this protected resource');
  }

  if (!params.codeChallenge) {
    throw new Error('code_challenge is required');
  }
  if (params.codeChallengeMethod !== 'S256') {
    throw new Error('code_challenge_method must be S256');
  }

  return {
    ...params,
    redirectUri: canonicalRedirectUri,
  };
}
