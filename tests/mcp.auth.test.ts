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
          description?: string;
          outputSchema?: { type?: string; properties?: Record<string, unknown> };
        }>;
      };
    };
    const statusTool = listed.result.tools.find((tool) => tool.name === 'mempalace_status');
    const wakeContextTool = listed.result.tools.find((tool) => tool.name === 'mempalace_wake_context');
    const addDrawerTool = listed.result.tools.find((tool) => tool.name === 'mempalace_add_drawer');
    const aaakTool = listed.result.tools.find((tool) => tool.name === 'mempalace_get_aaak_spec');
    const diaryWriteTool = listed.result.tools.find((tool) => tool.name === 'mempalace_diary_write');
    const diarySearchTool = listed.result.tools.find((tool) => tool.name === 'mempalace_diary_search');
    const diaryReindexTool = listed.result.tools.find((tool) => tool.name === 'mempalace_diary_reindex');
    const kgCheckTool = listed.result.tools.find((tool) => tool.name === 'mempalace_kg_check');

    expect(statusTool).toBeTruthy();
    expect(statusTool?.outputSchema?.type).toBe('object');
    expect(statusTool?.outputSchema?.properties).toHaveProperty('protocol');
    expect(statusTool?.outputSchema?.properties).toHaveProperty('backend');

    expect(wakeContextTool).toBeTruthy();
    expect(wakeContextTool?.description).toContain('Start here for memory-relevant chats');
    expect(wakeContextTool?.outputSchema?.type).toBe('object');
    expect(wakeContextTool?.outputSchema?.properties).toHaveProperty('context_items');
    expect(wakeContextTool?.outputSchema?.properties).toHaveProperty('withheld');

    expect(addDrawerTool).toBeTruthy();
    expect(addDrawerTool?.description).toContain('concise readable plain text');
    expect(addDrawerTool?.description).toContain('do not add an AAAK: prefix unless explicitly requested');
    expect(addDrawerTool?.outputSchema?.type).toBe('object');
    expect(addDrawerTool?.outputSchema?.properties).toHaveProperty('drawer_id');
    expect(addDrawerTool?.outputSchema?.properties).toHaveProperty('chunks');

    expect(aaakTool?.description).toContain('compact memory-note guidance');
    expect(aaakTool?.description).toContain('not literal AAAK-prefixed labels');
    expect(diaryWriteTool?.description).toContain('concise readable plain-text');
    expect(diaryWriteTool?.description).toContain('do not add an AAAK: prefix unless explicitly requested');
    expect(diarySearchTool?.description).toContain('Semantic search over diary entries');
    expect(diarySearchTool?.description).toContain('one explicit agent');
    expect(diarySearchTool?.outputSchema?.properties).toHaveProperty('results');
    expect(diaryReindexTool?.description).toContain('backfill or refresh diary semantic index');
    expect(diaryReindexTool?.outputSchema?.properties).toHaveProperty('reindexed');
    expect(kgCheckTool?.description).toContain('deterministic KG reliability checks');
    expect(kgCheckTool?.outputSchema?.properties).toHaveProperty('conflicts');
    expect(kgCheckTool?.outputSchema?.properties).toHaveProperty('stale_facts');
    expect(kgCheckTool?.outputSchema?.properties).toHaveProperty('source_warnings');
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
    expect(body.result.structuredContent?.protocol).toContain('Use mempalace_status for diagnostics, protocol text, quotas, and backend capabilities; do not treat status counts as wake-up memory context.');
    expect(body.result.structuredContent?.aaak_dialect).toContain('concise, readable plain text');
    expect(body.result.structuredContent?.aaak_dialect).toContain('Do not prefix normal drawer or diary entries with "AAAK:" unless the user explicitly requests that literal format.');
    expect(body.result.structuredContent?.aaak_dialect).toContain('Do not convert verbatim source content into AAAK');
    expect(body.result.structuredContent?.protocol).toContain('Write normal drawer and diary entries as concise, readable plain text; do not prefix them with "AAAK:" unless the user explicitly asks for that literal format.');
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
