import { describe, expect, it } from 'vitest';

import { requireConfig } from '../src/config';
import { addDrawer } from '../src/memory/drawers';
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

  it('rejects source_drawer_id from another tenant', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const authA = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));
    const authB = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-b'));

    const foreignDrawer = await addDrawer(env, config, authB, {
      wing: 'people',
      room: 'friends',
      content: 'Tenant B private memory',
    });

    await expect(
      kgAdd(env, config, authA, {
        subject: 'Yurii',
        predicate: 'knows',
        object: 'Friend',
        source_drawer_id: foreignDrawer.drawer_id,
      }),
    ).rejects.toThrow('source_drawer_id must reference an existing drawer for this tenant');
  });
});
