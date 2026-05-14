import type { AppEnv } from './config';
import { getConfigDiagnostics } from './config';
import { handleHealth } from './http/health';
import { handleAuthorizeGet, handleAuthorizePost } from './oauth/authorize';
import { buildAuthorizationServerMetadata, buildProtectedResourceMetadata, jsonResponse } from './oauth/metadata';
import { handleRegister } from './oauth/register';
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
      return handleToken(request, diagnostics.config);
    }

    if (url.pathname === '/mcp') {
      return handleMcpRequest(request, env);
    }

    return new Response('Not found', { status: 404 });
  },
};

export default handler;
