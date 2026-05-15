import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

import type { AppEnv } from '../config';
import { consumeQuotaReservation, releaseQuotaReservation, reserveQuota } from '../memory/quotas';
import { createMcpServer } from './server';
import { requireAuthenticatedMcpContext } from './context';
import { forbiddenJsonResponse, internalJsonResponse, unauthorizedMcpResponse } from './errors';

const DEFAULT_PROTOCOL_VERSION = '2025-03-26';

function methodNotAllowed(): Response {
  return new Response(JSON.stringify({ error: 'method_not_allowed' }, null, 2), {
    status: 405,
    headers: {
      allow: 'GET, POST, DELETE',
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

function sameOriginIssuerOrigin(issuer: string): string | null {
  try {
    return new URL(issuer).origin;
  } catch {
    return null;
  }
}

function isAllowedOrigin(origin: string, issuer: string): boolean {
  const issuerOrigin = sameOriginIssuerOrigin(issuer);
  if (issuerOrigin && origin === issuerOrigin) {
    return true;
  }
  return origin === 'https://chatgpt.com' || origin === 'https://chat.openai.com' || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
}

async function parseJsonRpcBody(request: Request): Promise<unknown | undefined> {
  if (request.method !== 'POST') {
    return undefined;
  }
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return undefined;
  }
  try {
    return await request.clone().json();
  } catch {
    return undefined;
  }
}

function payloadContainsInitialize(payload: unknown): boolean {
  if (Array.isArray(payload)) {
    return payload.some((item) => payloadContainsInitialize(item));
  }
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  return (payload as { method?: string }).method === 'initialize';
}

async function bootstrapStatelessServer(server: ReturnType<typeof createMcpServer>, request: Request, payload: unknown): Promise<void> {
  if (request.method !== 'POST' || payloadContainsInitialize(payload)) {
    return;
  }

  const protocolVersion = request.headers.get('mcp-protocol-version') ?? DEFAULT_PROTOCOL_VERSION;
  const internalServer = server.server as unknown as {
    // intentionally using private server internals for stateless bootstrap
    _oninitialize?: (request: unknown) => Promise<unknown>;
    oninitialized?: (() => void) | undefined;
  };

  if (typeof internalServer._oninitialize === 'function') {
    await internalServer._oninitialize({
      jsonrpc: '2.0',
      id: 'bootstrap',
      method: 'initialize',
      params: {
        protocolVersion,
        capabilities: {},
        clientInfo: {
          name: 'stateless-bootstrap',
          version: '0.1.0',
        },
      },
    });
  }

  internalServer.oninitialized?.();
}

async function finalizeJsonResponse(response: Response, cleanup: () => Promise<void>): Promise<Response> {
  try {
    const body = response.body ? await response.arrayBuffer() : null;
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } finally {
    await cleanup();
  }
}

function finalizeSseResponse(response: Response, request: Request, cleanup: () => Promise<void>): Response {
  const body = response.body;
  if (!body) {
    void cleanup();
    return response;
  }

  const reader = body.getReader();
  let cleaned = false;
  const runCleanup = async () => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    await cleanup();
  };

  request.signal.addEventListener('abort', () => {
    void runCleanup();
  }, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          await runCleanup();
          return;
        }
        if (value) {
          controller.enqueue(value);
        }
      } catch (error) {
        controller.error(error);
        await runCleanup();
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
      await runCleanup();
    },
  });

  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export async function handleMcpRequest(request: Request, env: AppEnv): Promise<Response> {
  if (!['GET', 'POST', 'DELETE'].includes(request.method)) {
    return methodNotAllowed();
  }

  let context;
  try {
    context = await requireAuthenticatedMcpContext(request, env);
  } catch (error) {
    if (error instanceof Error && error.message === 'Missing bearer token') {
      return unauthorizedMcpResponse(null, env);
    }
    return unauthorizedMcpResponse(null, env);
  }

  const origin = request.headers.get('origin');
  if (origin && !isAllowedOrigin(origin, context.config.issuer)) {
    return forbiddenJsonResponse(`Origin ${origin} is not allowed for /mcp`);
  }

  let reservationDay: string;
  try {
    reservationDay = await reserveQuota(env.DB!, context.config, context.auth.tenantId, 'mcp_calls', 1);
  } catch (error) {
    return internalJsonResponse(error instanceof Error ? error.message : String(error), 429);
  }

  const payload = await parseJsonRpcBody(request);
  const server = createMcpServer(env, context.config, context.auth);
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });

  const cleanup = async () => {
    await server.close().catch(() => undefined);
  };

  try {
    await server.connect(transport);
    await bootstrapStatelessServer(server, request, payload);
    const response = await transport.handleRequest(request, payload === undefined ? undefined : { parsedBody: payload });
      await consumeQuotaReservation(env.DB!, context.auth.tenantId, 'mcp_calls', 1, reservationDay);
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('text/event-stream')) {
      return finalizeSseResponse(response, request, cleanup);
    }
    return finalizeJsonResponse(response, cleanup);
  } catch (error) {
      await releaseQuotaReservation(env.DB!, context.auth.tenantId, 'mcp_calls', 1, reservationDay);
    await cleanup();
    return internalJsonResponse(error instanceof Error ? error.message : String(error));
  }
}
