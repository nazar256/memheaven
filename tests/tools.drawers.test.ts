import { describe, expect, it } from 'vitest';

import { requireConfig } from '../src/config';
import { addDrawer, deleteDrawer, getDrawer, listDrawers, updateDrawer } from '../src/memory/drawers';
import { createEnvWithKeys, verifyDirectAccessToken, mintDirectAccessToken } from './helpers/testData';

describe('drawer tools', async () => {
  it('stores, reads, lists, updates, and deletes drawers', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const auth = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));

    const created = await addDrawer(env, config, auth, {
      wing: 'projects',
      room: 'memheaven',
      content: 'MemHeaven uses Cloudflare and Vectorize for memory search.',
      source_file: 'notes/memheaven.md',
      added_by: 'yn',
    });
    expect(created.success).toBe(true);
    expect(created.chunks).toBeGreaterThan(0);

    const fetched = await getDrawer(env, config, auth, created.drawer_id);
    expect(fetched.content).toContain('Cloudflare');

    const listed = await listDrawers(env, config, auth, { wing: 'projects' });
    expect(listed.total).toBe(1);

    const updated = await updateDrawer(env, config, auth, {
      drawer_id: created.drawer_id,
      content: 'MemHeaven now uses Cloudflare Workers, D1, R2, Workers AI, and Vectorize.',
    });
    expect(updated.updated_fields).toContain('content');

    const deleted = await deleteDrawer(env, config, auth, created.drawer_id);
    expect(deleted.success).toBe(true);

    await expect(getDrawer(env, config, auth, created.drawer_id)).rejects.toThrow('Drawer not found');
  });

  it('is idempotent on exact duplicate add', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const auth = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));

    const first = await addDrawer(env, config, auth, { wing: 'people', room: 'friends', content: 'Anna likes travel planning.' });
    const second = await addDrawer(env, config, auth, { wing: 'people', room: 'friends', content: 'Anna likes travel planning.' });
    expect(second.reason).toBe('already_exists');
    expect(second.drawer_id).toBe(first.drawer_id);
  });

  it('supports maintenance reindex without changing content', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const auth = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));

    const created = await addDrawer(env, config, auth, { wing: 'projects', room: 'ops', content: 'Vector metadata indexes require reindexing after rollout.' });
    const reindexed = await updateDrawer(env, config, auth, { drawer_id: created.drawer_id, force_reindex: true });

    expect(reindexed.success).toBe(true);
    expect(reindexed.updated_fields).toContain('reindex');
  });
});
