import type { AppEnv } from './config';
import { getConfigDiagnostics } from './config';
import { handleHealth } from './http/health';
import { handleAuthorizeGet, handleAuthorizePost } from './oauth/authorize';
import { buildAuthorizationServerMetadata, buildProtectedResourceMetadata, jsonResponse } from './oauth/metadata';
import { handleRegister } from './oauth/register';
import { OAuthRateLimitError, enforceAuthFlowRateLimit } from './oauth/state';
import { handleToken } from './oauth/token';
import { handleMcpRequest } from './mcp/transport';

function methodNotAllowed(allow: string): Response {
  return new Response(JSON.stringify({ error: 'method_not_allowed' }, null, 2), {
    status: 405,
    headers: {
      allow,
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

function serviceInfo(env: AppEnv): Response {
  const diagnostics = getConfigDiagnostics(env);
  return jsonResponse({
    service: 'memheaven',
    status: diagnostics.ok ? 'configured' : 'needs-configuration',
    description: 'Cloudflare-native MemPalace-compatible remote MCP server for ChatGPT and other Streamable HTTP clients.',
    endpoints: {
      health: '/health',
      authorization_server_metadata: '/.well-known/oauth-authorization-server',
      protected_resource_metadata: '/.well-known/oauth-protected-resource',
      protected_resource_metadata_mcp: '/.well-known/oauth-protected-resource/mcp',
      dynamic_client_registration: '/register',
      authorize: '/authorize',
      token: '/token',
      mcp: '/mcp',
    },
    warnings: diagnostics.warnings,
    errors: diagnostics.errors,
  });
}

function clientIpFromRequest(request: Request): string {
  const cfConnectingIp = request.headers.get('cf-connecting-ip')?.trim();
  if (cfConnectingIp) {
    return cfConnectingIp;
  }
  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0]?.trim() || 'unknown';
  }
  return 'unknown';
}

function rateLimitedJsonResponse(retryAfterSeconds: number): Response {
  return jsonResponse(
    { error: 'temporarily_unavailable', error_description: 'Too many authentication attempts; try again shortly' },
    429,
    { 'retry-after': String(retryAfterSeconds) },
  );
}

function rateLimitedHtmlResponse(retryAfterSeconds: number): Response {
  return new Response('<h1>Try again shortly</h1><p>Too many authentication attempts. Please wait a minute and try again.</p>', {
    status: 429,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'retry-after': String(retryAfterSeconds),
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    },
  });
}

async function enforcePublicAuthRateLimit(request: Request, env: AppEnv, scope: 'register' | 'authorize_post' | 'token') {
  const diagnostics = getConfigDiagnostics(env);
  if (!diagnostics.config || !env.DB) {
    return;
  }
  const clientIp = clientIpFromRequest(request);
  await enforceAuthFlowRateLimit(
    env.DB,
    scope,
    clientIp,
    diagnostics.config.authFlowRateLimitPerMinute,
    diagnostics.config.authFlowRateLimitWindowSeconds,
  );
}

const handler = {
  async fetch(request: Request, env: AppEnv): Promise<Response> {
    const url = new URL(request.url);
    const diagnostics = getConfigDiagnostics(env);

    if (url.pathname === '/') {
      if (request.method !== 'GET') {
        return methodNotAllowed('GET');
      }
      return serviceInfo(env);
    }

    if (url.pathname === '/health') {
      if (request.method !== 'GET') {
        return methodNotAllowed('GET');
      }
      return handleHealth(env);
    }

    if (url.pathname === '/.well-known/oauth-authorization-server') {
      if (request.method !== 'GET') {
        return methodNotAllowed('GET');
      }
      if (!diagnostics.config) {
        return jsonResponse({ error: 'server_misconfigured', errors: diagnostics.errors, warnings: diagnostics.warnings }, 503);
      }
      return jsonResponse(buildAuthorizationServerMetadata(diagnostics.config));
    }

    if (url.pathname === '/.well-known/oauth-protected-resource' || url.pathname === '/.well-known/oauth-protected-resource/mcp') {
      if (request.method !== 'GET') {
        return methodNotAllowed('GET');
      }
      if (!diagnostics.config) {
        return jsonResponse({ error: 'server_misconfigured', errors: diagnostics.errors, warnings: diagnostics.warnings }, 503);
      }
      return jsonResponse(buildProtectedResourceMetadata(diagnostics.config));
    }

    if (url.pathname === '/register') {
      if (request.method !== 'POST') {
        return methodNotAllowed('POST');
      }
      if (!diagnostics.config) {
        return jsonResponse({ error: 'server_misconfigured', errors: diagnostics.errors, warnings: diagnostics.warnings }, 503);
      }
      try {
        await enforcePublicAuthRateLimit(request, env, 'register');
      } catch (error) {
        if (error instanceof OAuthRateLimitError) {
          return rateLimitedJsonResponse(error.retryAfterSeconds);
        }
        throw error;
      }
      return handleRegister(request, diagnostics.config);
    }

    if (url.pathname === '/authorize') {
      if (!diagnostics.config) {
        return jsonResponse({ error: 'server_misconfigured', errors: diagnostics.errors, warnings: diagnostics.warnings }, 503);
      }
      if (request.method === 'GET') {
        return handleAuthorizeGet(request, diagnostics.config);
      }
      if (request.method === 'POST') {
        try {
          await enforcePublicAuthRateLimit(request, env, 'authorize_post');
        } catch (error) {
          if (error instanceof OAuthRateLimitError) {
            return rateLimitedHtmlResponse(error.retryAfterSeconds);
          }
          throw error;
        }
        return handleAuthorizePost(request, diagnostics.config);
      }
      return methodNotAllowed('GET, POST');
    }

    if (url.pathname === '/token') {
      if (request.method !== 'POST') {
        return methodNotAllowed('POST');
      }
      if (!diagnostics.config) {
        return jsonResponse({ error: 'server_misconfigured', errors: diagnostics.errors, warnings: diagnostics.warnings }, 503);
      }
      try {
        await enforcePublicAuthRateLimit(request, env, 'token');
      } catch (error) {
        if (error instanceof OAuthRateLimitError) {
          return rateLimitedJsonResponse(error.retryAfterSeconds);
        }
        throw error;
      }
      return handleToken(request, diagnostics.config, env.DB!);
    }

    if (url.pathname === '/mcp') {
      return handleMcpRequest(request, env);
    }

    return new Response('Not found', { status: 404 });
  },
};

export default handler;
