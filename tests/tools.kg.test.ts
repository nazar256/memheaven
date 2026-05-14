import { describe, expect, it } from 'vitest';

import { requireConfig } from '../src/config';
import { kgAdd, kgInvalidate, kgQuery, kgStats, kgTimeline } from '../src/memory/kg';
import { createEnvWithKeys, mintDirectAccessToken, verifyDirectAccessToken } from './helpers/testData';

describe('kg tools', async () => {
  it('adds, queries, invalidates, and timelines facts', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const auth = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));

    await kgAdd(env, config, auth, { subject: 'Yurii', predicate: 'likes', object: 'TypeScript', valid_from: '2026-01-01' });
    const query = await kgQuery(env, auth, { entity: 'Yurii' });
    expect(query.facts).toHaveLength(1);

    await kgInvalidate(env, config, auth, { subject: 'Yurii', predicate: 'likes', object: 'TypeScript', ended: '2026-06-01' });
    const timeline = await kgTimeline(env, auth, { entity: 'Yurii' });
    expect(timeline.timeline[0]?.valid_to).toBe('2026-06-01');

    const stats = await kgStats(env, auth);
    expect(stats.entities).toBeGreaterThanOrEqual(2);
    expect(stats.triples).toBe(1);
  });
});
