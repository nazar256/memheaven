import { describe, expect, it } from 'vitest';

import handler from '../src/index';
import { createEnvWithKeys, mintCustomAccessToken, mintDirectAccessToken } from './helpers/testData';

describe('mcp auth envelope', async () => {
  it('returns 401 with WWW-Authenticate when unauthenticated', async () => {
    const env = await createEnvWithKeys();
    const response = await handler.fetch(new Request('https://memory.example.com/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) }), env);
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('resource_metadata');
  });

  it('allows authenticated tool listing and status', async () => {
    const env = await createEnvWithKeys();
    const token = await mintDirectAccessToken(env, 'tenant-a');

    const tools = await handler.fetch(new Request('https://memory.example.com/mcp', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-03-26',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    }), env);
    expect(tools.status).toBe(200);
    const listed = await tools.json() as {
      result: {
        tools: Array<{
          name: string;
          outputSchema?: { type?: string; properties?: Record<string, unknown> };
        }>;
      };
    };
    const statusTool = listed.result.tools.find((tool) => tool.name === 'mempalace_status');
    const addDrawerTool = listed.result.tools.find((tool) => tool.name === 'mempalace_add_drawer');

    expect(statusTool).toBeTruthy();
    expect(statusTool?.outputSchema?.type).toBe('object');
    expect(statusTool?.outputSchema?.properties).toHaveProperty('protocol');
    expect(statusTool?.outputSchema?.properties).toHaveProperty('backend');

    expect(addDrawerTool).toBeTruthy();
    expect(addDrawerTool?.outputSchema?.type).toBe('object');
    expect(addDrawerTool?.outputSchema?.properties).toHaveProperty('drawer_id');
    expect(addDrawerTool?.outputSchema?.properties).toHaveProperty('chunks');
  });

  it('returns structured content matching advertised schemas for tool calls', async () => {
    const env = await createEnvWithKeys();
    const token = await mintDirectAccessToken(env, 'tenant-a');

    const response = await handler.fetch(new Request('https://memory.example.com/mcp', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-03-26',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'mempalace_status',
          arguments: {},
        },
      }),
    }), env);

    expect(response.status).toBe(200);
    const body = await response.json() as {
      result: {
        isError?: boolean;
        structuredContent?: Record<string, unknown>;
        content?: Array<{ text?: string }>;
      };
    };

    expect(body.result.isError).not.toBe(true);
    expect(body.result.structuredContent).toBeTruthy();
    expect(body.result.structuredContent).toHaveProperty('protocol');
    expect(body.result.structuredContent).toHaveProperty('backend');
    expect(body.result.content?.[0]?.text).toContain('protocol');
  });

  it('rejects an access token after the backing key is removed', async () => {
    const env = await createEnvWithKeys();
    const token = await mintDirectAccessToken(env, 'tenant-a');
    env.ACCESS_KEYS_JSON = JSON.stringify([
      {
        id: 'tenant-b-key',
        tenant_id: 'tenant-b',
        label: 'Tenant B',
        hash: JSON.parse(env.ACCESS_KEYS_JSON ?? '[]')[1].hash,
        scopes: ['memory.read', 'memory.write'],
        active: true,
      },
    ]);

    const response = await handler.fetch(new Request('https://memory.example.com/mcp', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-03-26',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    }), env);

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('invalid_token');
  });

  it('rejects write tools when the key only grants memory.read', async () => {
    const env = await createEnvWithKeys({ tenantA: { scopes: ['memory.read'] } });
    const token = await mintDirectAccessToken(env, 'tenant-a');

    const response = await handler.fetch(new Request('https://memory.example.com/mcp', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-03-26',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'mempalace_add_drawer',
          arguments: { wing: 'people', room: 'family', content: 'No writes allowed.' },
        },
      }),
    }), env);

    expect(response.status).toBe(200);
    const body = await response.json() as { result: { isError?: boolean; content?: Array<{ text?: string }> } };
    expect(body.result.isError).toBe(true);
    expect(body.result.content?.[0]?.text).toContain('memory.write');
  });

  it('rejects a token whose key id points at a different tenant', async () => {
    const env = await createEnvWithKeys();
    const token = await mintCustomAccessToken(env, {
      tenantId: 'tenant-a',
      keyId: 'tenant-b-key',
      keyLabel: 'Tenant B',
      scopes: ['memory.read'],
    });

    const response = await handler.fetch(new Request('https://memory.example.com/mcp', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-03-26',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    }), env);

    expect(response.status).toBe(401);
  });
});
