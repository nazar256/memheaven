import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';

import { createMcpServer } from '../src/mcp/server';
import { createGlamaRuntime } from '../glama/env';

type ToolCall = {
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

function structured(result: ToolCall): Record<string, unknown> {
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toBeTruthy();
  return result.structuredContent as Record<string, unknown>;
}

describe('Glama MCP composition', () => {
  it('initializes, lists the production tools, and runs representative drawer/diary/KG flows', async () => {
    const runtime = await createGlamaRuntime();
    const server = createMcpServer(runtime.env, runtime.config, runtime.auth);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'glama-test-client', version: '1.0.0' });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      expect(client.getServerVersion()?.name).toBe('memheaven');
      const listed = await client.listTools();
      expect(listed.tools).toHaveLength(34);
      const missingToolTitles = listed.tools
        .filter((tool) => typeof tool.title !== 'string' || tool.title.trim().length === 0 || tool.annotations?.title !== tool.title)
        .map((tool) => tool.name);
      expect(missingToolTitles).toEqual([]);
      const missingParameterDescriptions = listed.tools.flatMap((tool) => Object.entries(tool.inputSchema.properties ?? {})
        .filter(([, schema]) => {
          const description = (schema as { description?: unknown }).description;
          return typeof description !== 'string' || description.trim().length === 0;
        })
        .map(([parameter]) => `${tool.name}.${parameter}`));
      expect(missingParameterDescriptions).toEqual([]);
      const toolNames = new Set(listed.tools.map((tool) => tool.name));
      expect([...toolNames]).toEqual(expect.arrayContaining([
        'mempalace_status',
        'mempalace_add_drawer',
        'mempalace_get_drawer',
        'mempalace_search',
        'mempalace_update_drawer',
        'mempalace_delete_drawer',
        'mempalace_diary_write',
        'mempalace_diary_read',
        'mempalace_diary_search',
        'mempalace_kg_add',
        'mempalace_kg_query',
      ]));

      const destructiveNames = new Set(
        listed.tools.filter((tool) => tool.annotations?.destructiveHint === true).map((tool) => tool.name),
      );
      expect([...destructiveNames].sort()).toEqual([
        'mempalace_delete_drawer',
        'mempalace_kg_invalidate',
        'mempalace_delete_tunnel',
      ].sort());

      const status = structured(await client.callTool({ name: 'mempalace_status', arguments: {} }) as ToolCall);
      expect((status.backend as Record<string, unknown>).deployment).toBe('glama-inspection');
      expect((status.backend as Record<string, unknown>).ephemeral).toBe(true);
      const reconnect = structured(await client.callTool({ name: 'mempalace_reconnect', arguments: {} }) as ToolCall);
      expect(reconnect.message).toContain('glama-inspection');
      const filedAway = structured(await client.callTool({ name: 'mempalace_memories_filed_away', arguments: {} }) as ToolCall);
      expect(filedAway.cloud_mode).toBe(false);

      const added = structured(await client.callTool({
        name: 'mempalace_add_drawer',
        arguments: { wing: 'projects', room: 'glama', content: 'Glama drawer content before update.' },
      }) as ToolCall);
      const drawerId = String(added.drawer_id);
      expect(added.success).toBe(true);

      const fetched = structured(await client.callTool({ name: 'mempalace_get_drawer', arguments: { drawer_id: drawerId } }) as ToolCall);
      expect(fetched.content).toBe('Glama drawer content before update.');

      const search = structured(await client.callTool({ name: 'mempalace_search', arguments: { query: 'Glama drawer content', limit: 5 } }) as ToolCall);
      expect((search.results as unknown[]).some((item) => (item as { drawer_id: string }).drawer_id === drawerId)).toBe(true);

      const updated = structured(await client.callTool({
        name: 'mempalace_update_drawer',
        arguments: { drawer_id: drawerId, content: 'Glama drawer content after update.' },
      }) as ToolCall);
      expect(updated.drawer_id).toBe(drawerId);
      const updatedFetch = structured(await client.callTool({ name: 'mempalace_get_drawer', arguments: { drawer_id: drawerId } }) as ToolCall);
      expect(updatedFetch.content).toBe('Glama drawer content after update.');
      const updatedSearch = structured(await client.callTool({ name: 'mempalace_search', arguments: { query: 'after update', limit: 5 } }) as ToolCall);
      expect((updatedSearch.results as unknown[]).some((item) => (item as { drawer_id: string }).drawer_id === drawerId)).toBe(true);

      const diaryWrite = structured(await client.callTool({
        name: 'mempalace_diary_write',
        arguments: { agent_name: 'glama-agent', topic: 'smoke', entry: 'Glama diary smoke entry.', wing: 'projects', room: 'glama' },
      }) as ToolCall);
      expect(diaryWrite.success).toBe(true);
      const diaryRead = structured(await client.callTool({ name: 'mempalace_diary_read', arguments: { agent_name: 'glama-agent', last_n: 5 } }) as ToolCall);
      expect((diaryRead.entries as unknown[]).some((entry) => (entry as { content: string }).content === 'Glama diary smoke entry.')).toBe(true);
      const diarySearch = structured(await client.callTool({ name: 'mempalace_diary_search', arguments: { agent_name: 'glama-agent', query: 'diary smoke' } }) as ToolCall);
      expect((diarySearch.results as unknown[]).length).toBeGreaterThan(0);

      const kgAdd = structured(await client.callTool({
        name: 'mempalace_kg_add',
        arguments: { subject: 'Glama', predicate: 'status', object: 'ready', valid_from: '2026-01-01' },
      }) as ToolCall);
      expect(kgAdd.success).toBe(true);
      const kgQuery = structured(await client.callTool({ name: 'mempalace_kg_query', arguments: { entity: 'Glama', direction: 'outgoing', as_of: '2026-08-11' } }) as ToolCall);
      expect((kgQuery.facts as unknown[]).some((fact) => (fact as { object: string }).object === 'ready')).toBe(true);

      const deleted = structured(await client.callTool({ name: 'mempalace_delete_drawer', arguments: { drawer_id: drawerId } }) as ToolCall);
      expect(deleted.success).toBe(true);
    } finally {
      await client.close();
      await server.close();
      if (runtime.env.DB && 'sqlite' in runtime.env.DB) {
        (runtime.env.DB as { sqlite: { close(): void } }).sqlite.close();
      }
    }
  });
});
