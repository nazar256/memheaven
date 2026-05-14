import type { AppConfig } from '../config';
import { deriveClientId, canonicalizeRedirectUri, isAllowedRedirectUri } from '../security/validators';
import { jsonResponse } from './metadata';

interface DynamicClientRegistrationRequest {
  redirect_uris?: string[];
  client_name?: string;
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
}

export async function handleRegister(request: Request, config: AppConfig): Promise<Response> {
  const payload = (await request.json()) as DynamicClientRegistrationRequest;
  if (!Array.isArray(payload.redirect_uris) || payload.redirect_uris.length !== 1) {
    return jsonResponse({ error: 'invalid_redirect_uri', error_description: 'Exactly one redirect URI is required' }, 400);
  }

  const [redirectUriValue] = payload.redirect_uris;
  if (!redirectUriValue) {
    return jsonResponse({ error: 'invalid_redirect_uri', error_description: 'Redirect URI is required' }, 400);
  }

  const redirectUri = canonicalizeRedirectUri(redirectUriValue);
  if (!isAllowedRedirectUri(redirectUri)) {
    return jsonResponse({ error: 'invalid_redirect_uri', error_description: 'Redirect URI is not allowed' }, 400);
  }

  const clientId = await deriveClientId(config.issuer, redirectUri);

  return jsonResponse({
    client_id: clientId,
    client_name: payload.client_name ?? 'ChatGPT MCP Client',
    redirect_uris: [redirectUri],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    scope: config.supportedScopes.join(' '),
  }, 201);
}
