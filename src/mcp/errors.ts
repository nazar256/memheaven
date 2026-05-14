import type { AppConfig, AppEnv } from '../config';
import { redactErrorMessage } from '../security/redact';

export function buildAuthenticateHeader(configLike: Pick<AppConfig, 'issuer' | 'supportedScopes'> | null, env: AppEnv): string {
  const issuer = configLike?.issuer ?? env.OAUTH_ISSUER ?? 'https://memory.example.com';
  const scopes = configLike?.supportedScopes ?? ['memory.read', 'memory.write'];
  return `Bearer realm="${issuer}", error="invalid_token", resource_metadata="${issuer}/.well-known/oauth-protected-resource/mcp", scope="${scopes.join(' ')}"`;
}

export function unauthorizedMcpResponse(configLike: Pick<AppConfig, 'issuer' | 'supportedScopes'> | null, env: AppEnv): Response {
  return new Response(JSON.stringify({ error: 'invalid_token', error_description: 'Bearer token is required for /mcp' }, null, 2), {
    status: 401,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'www-authenticate': buildAuthenticateHeader(configLike, env),
    },
  });
}

export function forbiddenJsonResponse(message: string): Response {
  return new Response(JSON.stringify({ error: 'forbidden', error_description: message }, null, 2), {
    status: 403,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export function internalJsonResponse(message: string, status = 500): Response {
  return new Response(JSON.stringify({ error: 'server_error', error_description: redactErrorMessage(message) }, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export function toToolErrorResult(error: unknown) {
  const message = redactErrorMessage(error instanceof Error ? error.message : String(error));
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true,
  };
}
