import type { AppConfig } from '../config';

export function buildAuthorizationServerMetadata(config: AppConfig) {
  return {
    issuer: config.issuer,
    authorization_endpoint: `${config.issuer}/authorize`,
    token_endpoint: `${config.issuer}/token`,
    registration_endpoint: `${config.issuer}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: config.supportedScopes,
  };
}

export function buildProtectedResourceMetadata(config: AppConfig) {
  return {
    resource: config.mcpResource,
    authorization_servers: [config.issuer],
    scopes_supported: config.supportedScopes,
    bearer_methods_supported: ['header'],
    resource_documentation: `${config.issuer}/`,
  };
}

export function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}
