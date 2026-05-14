import { describe, expect, it } from 'vitest';

import { requireConfig } from '../src/config';
import { addDrawer, checkDuplicate, searchDrawers } from '../src/memory/drawers';
import { createEnvWithKeys, mintDirectAccessToken, verifyDirectAccessToken } from './helpers/testData';

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
});
