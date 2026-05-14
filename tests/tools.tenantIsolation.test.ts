import { describe, expect, it } from 'vitest';

import { requireConfig } from '../src/config';
import { addDrawer, getDrawer, listDrawers, searchDrawers, updateDrawer, deleteDrawer } from '../src/memory/drawers';
import { diaryRead, diaryWrite } from '../src/memory/diary';
import { kgAdd, kgQuery } from '../src/memory/kg';
import { createEnvWithKeys, mintDirectAccessToken, verifyDirectAccessToken } from './helpers/testData';

describe('tenant isolation', async () => {
  it('prevents tenant B from seeing tenant A data across drawers, diary, and kg', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const tenantA = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));
    const tenantB = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-b'));

    const drawer = await addDrawer(env, config, tenantA, { wing: 'people', room: 'family', content: 'Anna prefers aisle seats.' });
    await diaryWrite(env, config, tenantA, { agent_name: 'chatgpt', entry: 'Remembered Anna preference.', topic: 'travel' });
    await kgAdd(env, config, tenantA, { subject: 'Anna', predicate: 'prefers', object: 'aisle seats' });

    expect((await searchDrawers(env, config, tenantB, { query: 'aisle seats', limit: 5 })).results).toHaveLength(0);
    await expect(getDrawer(env, config, tenantB, drawer.drawer_id)).rejects.toThrow('Drawer not found');
    expect((await listDrawers(env, config, tenantB, {})).total).toBe(0);
    await expect(updateDrawer(env, config, tenantB, { drawer_id: drawer.drawer_id, content: 'hijack' })).rejects.toThrow('Drawer not found');
    expect((await deleteDrawer(env, config, tenantB, drawer.drawer_id)).already_deleted).toBe(true);
    expect((await kgQuery(env, tenantB, { entity: 'Anna' })).facts).toHaveLength(0);
    expect((await diaryRead(env, config, tenantB, { agent_name: 'chatgpt' })).entries).toHaveLength(0);
  });
});
