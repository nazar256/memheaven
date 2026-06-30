import { describe, expect, it } from 'vitest';

import type { AppEnv } from '../src/config';
import { requireConfig } from '../src/config';
import { addDrawer, checkDuplicate, searchDrawers, updateDrawer } from '../src/memory/drawers';
import type { TenantAuthContext } from '../src/memory/types';
import type { FakeVectorize } from './helpers/fakes';
import { createEnvWithKeys, mintDirectAccessToken, verifyDirectAccessToken } from './helpers/testData';

async function embeddingFor(env: AppEnv, text: string): Promise<number[]> {
  const response = await env.AI!.run('@cf/baai/bge-small-en-v1.5', { text }) as { data: number[][] };
  return response.data[0]!;
}

function zeroVector(): number[] {
  return Array.from({ length: 384 }, () => 0);
}

function forceDrawerVector(env: AppEnv, drawerId: string, values: number[]): void {
  const vectorize = env.VECTORIZE as FakeVectorize;
  for (const vector of vectorize.vectors.values()) {
    if (vector.metadata?.drawer_id === drawerId) {
      vector.values = values;
    }
  }
}

async function addSearchDrawer(env: AppEnv, auth: TenantAuthContext, wing: string, room: string, content: string) {
  const config = requireConfig(env);
  return addDrawer(env, config, auth, { wing, room, content });
}

describe('search and duplicate tools', async () => {
  it('returns relevant tenant-scoped semantic results', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const authA = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));
    const authB = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-b'));

    await addDrawer(env, config, authA, { wing: 'projects', room: 'travel', content: 'Kyoto itinerary includes temples and ramen spots.' });
    await addDrawer(env, config, authB, { wing: 'projects', room: 'finance', content: 'Quarterly budget review and vendor invoices.' });

    const search = await searchDrawers(env, config, authA, { query: 'ramen in kyoto', limit: 5 });
    expect(search.results).toHaveLength(1);
    expect(search.results[0]?.text).toContain('Kyoto itinerary');
  });

  it('detects exact duplicates and semantic near-duplicates', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const auth = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));

    await addDrawer(env, config, auth, { wing: 'people', room: 'prefs', content: 'Yurii prefers concise answers and clear behavior.' });

    const exact = await checkDuplicate(env, config, auth, { content: 'Yurii prefers concise answers and clear behavior.' });
    expect(exact.is_duplicate).toBe(true);

    const semantic = await checkDuplicate(env, config, auth, { content: 'Yurii likes concise answers with explicit behavior', threshold: 0.5 });
    expect(semantic.matches.length).toBeGreaterThan(0);
  });

  it('reranks a wider semantic candidate pool with exact phrase and identifier matches', async () => {
    const env = await createEnvWithKeys();
    env.SEARCH_MAX_LIMIT = '25';
    const config = requireConfig(env);
    const auth = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));
    const query = 'what did we decide about "PER-30" wake context';
    const queryVector = await embeddingFor(env, query);

    const generic = await addSearchDrawer(env, auth, 'projects', 'memheaven', 'Completely unrelated semantic candidate with no useful lexical evidence.');
    const exact = await addSearchDrawer(env, auth, 'projects', 'memheaven', 'PER-30: decided wake context must stay separate from mempalace_status.');

    forceDrawerVector(env, generic.drawer_id, queryVector);
    forceDrawerVector(env, exact.drawer_id, zeroVector());

    const search = await searchDrawers(env, config, auth, { query, limit: 1 });

    expect(search.results).toHaveLength(1);
    expect(search.results[0]?.drawer_id).toBe(exact.drawer_id);
    expect(search.results[0]?.text).toContain('PER-30');
  });

  it('keeps wing and room filters as hard filters during reranking', async () => {
    const env = await createEnvWithKeys();
    env.SEARCH_MAX_LIMIT = '25';
    const config = requireConfig(env);
    const auth = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));
    const query = '"PER-30" wake context';
    const queryVector = await embeddingFor(env, query);

    const work = await addSearchDrawer(env, auth, 'work', 'memheaven', 'PER-30: work project wake context decision.');
    const personal = await addSearchDrawer(env, auth, 'personal', 'notes', 'PER-30: personal note that should not cross wing filters.');

    forceDrawerVector(env, personal.drawer_id, queryVector);
    forceDrawerVector(env, work.drawer_id, zeroVector());

    const search = await searchDrawers(env, config, auth, { query, wing: 'work', room: 'memheaven', limit: 5 });

    expect(search.results.map((result) => result.drawer_id)).toEqual([work.drawer_id]);
  });

  it('collapses duplicate chunks from the same drawer before final results', async () => {
    const env = await createEnvWithKeys();
    env.SEARCH_MAX_LIMIT = '25';
    const config = requireConfig(env);
    const auth = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));
    const repeated = `${'PER-31 hybrid reranking exact phrase. '.repeat(60)}\n\n${'PER-31 hybrid reranking exact phrase. '.repeat(60)}`;
    const drawer = await addSearchDrawer(env, auth, 'projects', 'memheaven', repeated);

    const search = await searchDrawers(env, config, auth, { query: '"PER-31 hybrid reranking"', limit: 5 });

    expect(search.results).toHaveLength(1);
    expect(search.results[0]?.drawer_id).toBe(drawer.drawer_id);
  });

  it('finds new and reindexed drawers by lexical fallback when Vectorize has not exposed fresh vectors yet', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const auth = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));
    const vectorize = env.VECTORIZE as FakeVectorize;

    const added = await addDrawer(env, config, auth, {
      wing: 'projects',
      room: 'MemHeaven-smoke-test',
      content: 'TEMP MEMHEAVEN RETEST token mh-retest-20260630-unique-alpha. This drawer verifies search indexing.',
    });
    vectorize.vectors.clear();

    const addedSearch = await searchDrawers(env, config, auth, {
      query: 'mh-retest-20260630-unique-alpha',
      wing: 'projects',
      room: 'MemHeaven-smoke-test',
      limit: 5,
      max_distance: 2,
    });
    expect(addedSearch.results.map((result) => result.drawer_id)).toContain(added.drawer_id);

    await updateDrawer(env, config, auth, {
      drawer_id: added.drawer_id,
      content: 'TEMP MEMHEAVEN RETEST token mh-retest-20260630-unique-alpha. Updated token mh-retest-20260630-unique-beta. This drawer verifies update reindex behavior.',
      force_reindex: true,
    });
    vectorize.vectors.clear();

    const updatedSearch = await searchDrawers(env, config, auth, {
      query: 'mh-retest-20260630-unique-beta verifying update reindex behavior',
      wing: 'projects',
      room: 'MemHeaven-smoke-test',
      limit: 5,
      max_distance: 2,
    });
    expect(updatedSearch.results.map((result) => result.drawer_id)).toContain(added.drawer_id);
    expect(updatedSearch.results[0]?.text).toContain('mh-retest-20260630-unique-beta');
  });

  it('applies max_distance against vector distance before reranking', async () => {
    const env = await createEnvWithKeys();
    env.SEARCH_MAX_LIMIT = '25';
    const config = requireConfig(env);
    const auth = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));
    const query = 'OAuth callback allowlist';
    const queryVector = await embeddingFor(env, query);

    const close = await addSearchDrawer(env, auth, 'projects', 'auth', 'OAuth callback allowlist for hosted clients.');
    const far = await addSearchDrawer(env, auth, 'projects', 'auth', 'OAuth callback allowlist exact lexical text but vector distance should filter it.');

    forceDrawerVector(env, close.drawer_id, queryVector);
    forceDrawerVector(env, far.drawer_id, zeroVector());

    const search = await searchDrawers(env, config, auth, { query, limit: 5, max_distance: 0.2 });

    expect(search.results.map((result) => result.drawer_id)).toEqual([close.drawer_id]);
  });
});
