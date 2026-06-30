import { describe, expect, it } from 'vitest';

import type { VectorizeVector } from '../src/config';
import { requireConfig } from '../src/config';
import { diaryRead, diaryReindex, diarySearch, diaryWrite } from '../src/memory/diary';
import { searchDrawers } from '../src/memory/drawers';
import { createEnvWithKeys, mintDirectAccessToken, verifyDirectAccessToken } from './helpers/testData';

describe('diary tools', async () => {
  it('writes and reads recent diary entries', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const auth = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));

    const first = await diaryWrite(env, config, auth, {
      agent_name: 'ChatGPT',
      topic: 'preferences',
      wing: 'wing_chatgpt',
      room: 'diary',
      entry: 'Yurii prefers concise answers with explicit behavior.',
    });
    const second = await diaryWrite(env, config, auth, {
      agent_name: 'ChatGPT',
      topic: 'project',
      wing: 'wing_chatgpt',
      room: 'diary',
      entry: 'MemHeaven is a Cloudflare-native port of MemPalace.',
    });

    expect(first.success).toBe(true);
    expect(first.wing).toBe('wing_chatgpt');
    expect(first.room).toBe('diary');
    expect(first.chunks).toBeGreaterThan(0);
    expect(second.success).toBe(true);

    const entries = await diaryRead(env, config, auth, { agent_name: 'chatgpt', last_n: 2 });
    expect(entries.total).toBe(2);
    expect(entries.showing).toBe(2);
    expect(entries.entries[0]?.content).toContain('MemHeaven');
    expect(entries.entries[1]?.content).toContain('concise answers');
    expect(entries.entries[0]?.wing).toBe('wing_chatgpt');
    expect(entries.entries[0]?.room).toBe('diary');
  });

  it('indexes new diary writes and searches them under explicit agent scope', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const auth = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));

    await diaryWrite(env, config, auth, {
      agent_name: 'Reviewer',
      topic: 'review-style',
      wing: 'wing_reviewer',
      room: 'diary',
      entry: 'Reviewer prefers checking redirect allowlists before touching OAuth code.',
    });
    await diaryWrite(env, config, auth, {
      agent_name: 'Architect',
      topic: 'planning',
      wing: 'wing_architect',
      room: 'diary',
      entry: 'Architect focuses on cross-module rollout plans and migration risks.',
    });

    const vectors = [...(env.VECTORIZE as unknown as { vectors: Map<string, VectorizeVector> }).vectors.values()];
    const diaryVector = vectors.find((vector) => vector.metadata?.kind === 'diary' && vector.metadata.agent_name === 'reviewer');
    expect(diaryVector?.metadata).toMatchObject({
      kind: 'diary',
      agent_name: 'reviewer',
      topic: 'review-style',
      wing: 'wing_reviewer',
      room: 'diary',
      tenant_id: 'tenant-a',
    });
    expect(diaryVector?.metadata).toHaveProperty('diary_id');
    expect(diaryVector?.metadata).toHaveProperty('chunk_index');
    expect(diaryVector?.metadata).toHaveProperty('created_at');

    const result = await diarySearch(env, config, auth, {
      agent_name: 'reviewer',
      query: 'OAuth redirect allowlists',
      limit: 3,
    });

    expect(result.filters).toEqual({ agent: 'reviewer', wing: null, room: null, topic: null });
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      agent: 'reviewer',
      topic: 'review-style',
      wing: 'wing_reviewer',
      room: 'diary',
      chunk_index: 0,
    });
    expect(result.results[0]?.preview).toContain('redirect allowlists');
  });

  it('hard-filters diary read and search by wing, room, topic, agent, and tenant', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const tenantA = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));
    const tenantB = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-b'));

    await diaryWrite(env, config, tenantA, {
      agent_name: 'ChatGPT',
      topic: 'alpha',
      wing: 'wing_alpha',
      room: 'diary',
      entry: 'Alpha diary mentions the private nebula project.',
    });
    await diaryWrite(env, config, tenantA, {
      agent_name: 'ChatGPT',
      topic: 'beta',
      wing: 'wing_beta',
      room: 'scratch',
      entry: 'Beta diary mentions the public comet project.',
    });
    await diaryWrite(env, config, tenantA, {
      agent_name: 'Reviewer',
      topic: 'alpha',
      wing: 'wing_alpha',
      room: 'diary',
      entry: 'Reviewer diary also mentions the private nebula project.',
    });
    await diaryWrite(env, config, tenantB, {
      agent_name: 'ChatGPT',
      topic: 'alpha',
      wing: 'wing_alpha',
      room: 'diary',
      entry: 'Tenant B diary mentions the private nebula project.',
    });

    const scopedRead = await diaryRead(env, config, tenantA, {
      agent_name: 'chatgpt',
      wing: 'wing_beta',
      room: 'scratch',
      last_n: 10,
    });
    expect(scopedRead.total).toBe(1);
    expect(scopedRead.entries[0]?.topic).toBe('beta');

    const wrongRoom = await diarySearch(env, config, tenantA, {
      agent_name: 'chatgpt',
      query: 'private nebula project',
      wing: 'wing_alpha',
      room: 'scratch',
    });
    expect(wrongRoom.results).toHaveLength(0);

    const scopedSearch = await diarySearch(env, config, tenantA, {
      agent_name: 'chatgpt',
      query: 'private nebula project',
      wing: 'wing_alpha',
      room: 'diary',
      topic: 'alpha',
    });
    expect(scopedSearch.results).toHaveLength(1);
    expect(scopedSearch.results[0]?.agent).toBe('chatgpt');
    expect(scopedSearch.results[0]?.preview).toContain('Alpha diary');

    const otherAgent = await diarySearch(env, config, tenantA, {
      agent_name: 'reviewer',
      query: 'private nebula project',
      wing: 'wing_alpha',
      room: 'diary',
      topic: 'alpha',
    });
    expect(otherAgent.results).toHaveLength(1);
    expect(otherAgent.results[0]?.agent).toBe('reviewer');

    const otherTenant = await diarySearch(env, config, tenantB, {
      agent_name: 'chatgpt',
      query: 'private nebula project',
      wing: 'wing_alpha',
      room: 'diary',
      topic: 'alpha',
    });
    expect(otherTenant.results).toHaveLength(1);
    expect(otherTenant.results[0]?.preview).toContain('Tenant B diary');
  });

  it('keeps normal drawer search diary-free by default', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const auth = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));

    await diaryWrite(env, config, auth, {
      agent_name: 'ChatGPT',
      topic: 'search',
      entry: 'Diary-only phrase: saffron moon ledger.',
    });

    const drawerResults = await searchDrawers(env, config, auth, {
      query: 'saffron moon ledger',
      limit: 5,
    });
    expect(drawerResults.results).toHaveLength(0);

    const diaryResults = await diarySearch(env, config, auth, {
      agent_name: 'chatgpt',
      query: 'saffron moon ledger',
      limit: 5,
    });
    expect(diaryResults.results).toHaveLength(1);
    expect(diaryResults.results[0]?.preview).toContain('saffron moon ledger');
  });

  it('backfills existing diary entries into semantic search with diary reindex', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const auth = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));

    const written = await diaryWrite(env, config, auth, {
      agent_name: 'ChatGPT',
      topic: 'upgrade',
      wing: 'wing_chatgpt',
      room: 'diary',
      entry: 'Upgrade backfill should recover the old amethyst handoff note.',
    });

    const dbStore = env.DB as unknown as { store: { diary_chunks: unknown[] } };
    dbStore.store.diary_chunks = [];
    const vectorStore = env.VECTORIZE as unknown as { vectors: Map<string, VectorizeVector> };
    for (const [id, vector] of vectorStore.vectors.entries()) {
      if (vector.metadata?.kind === 'diary') {
        vectorStore.vectors.delete(id);
      }
    }

    const missingBeforeBackfill = await diarySearch(env, config, auth, {
      agent_name: 'chatgpt',
      query: 'amethyst handoff note',
      limit: 5,
    });
    expect(missingBeforeBackfill.results).toHaveLength(0);

    const dryRun = await diaryReindex(env, config, auth, {
      agent_name: 'chatgpt',
      dry_run: true,
    });
    expect(dryRun).toMatchObject({ success: true, dry_run: true, total: 1, count: 1, reindexed: 0, failed: 0 });
    expect(dbStore.store.diary_chunks).toHaveLength(0);

    const reindexed = await diaryReindex(env, config, auth, {
      agent_name: 'chatgpt',
    });
    expect(reindexed).toMatchObject({ success: true, dry_run: false, total: 1, count: 1, reindexed: 1, failed: 0 });
    expect(reindexed.results[0]).toMatchObject({
      entry_id: written.entry_id,
      agent: 'chatgpt',
      topic: 'upgrade',
      wing: 'wing_chatgpt',
      room: 'diary',
      success: true,
    });

    const foundAfterBackfill = await diarySearch(env, config, auth, {
      agent_name: 'chatgpt',
      query: 'amethyst handoff note',
      limit: 5,
    });
    expect(foundAfterBackfill.results).toHaveLength(1);
    expect(foundAfterBackfill.results[0]?.entry_id).toBe(written.entry_id);
    expect(foundAfterBackfill.results[0]?.preview).toContain('amethyst handoff note');
  });
});
