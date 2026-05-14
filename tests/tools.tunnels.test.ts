import { describe, expect, it } from 'vitest';

import { requireConfig } from '../src/config';
import { addDrawer } from '../src/memory/drawers';
import { createTunnel, deleteTunnel, findTunnels, followTunnels, graphStats, listTunnels, traverse } from '../src/memory/tunnels';
import { createEnvWithKeys, mintDirectAccessToken, verifyDirectAccessToken } from './helpers/testData';

describe('tunnel and graph tools', async () => {
  it('finds shared-room tunnels and traverses explicit tunnels', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const auth = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));

    const kyoto = await addDrawer(env, config, auth, {
      wing: 'travel',
      room: 'kyoto',
      content: 'Kyoto trip includes temples and ramen spots.',
    });
    await addDrawer(env, config, auth, {
      wing: 'food',
      room: 'kyoto',
      content: 'Kyoto ramen shortlist for late-night meals.',
    });
    const osaka = await addDrawer(env, config, auth, {
      wing: 'travel',
      room: 'osaka',
      content: 'Osaka stopover includes Dotonbori and hotel notes.',
    });

    const passive = await findTunnels(env, auth, {});
    expect(passive.count).toBe(1);
    expect(passive.tunnels[0]?.room).toBe('kyoto');

    const explicit = await createTunnel(env, config, auth, {
      source_wing: 'travel',
      source_room: 'kyoto',
      target_wing: 'travel',
      target_room: 'osaka',
      label: 'next stop',
      source_drawer_id: kyoto.drawer_id,
      target_drawer_id: osaka.drawer_id,
    });
    expect(explicit.success).toBe(true);

    const listed = await listTunnels(env, auth, { wing: 'travel' });
    expect(listed.count).toBe(1);

    const followed = await followTunnels(env, auth, { wing: 'travel', room: 'kyoto' });
    expect(followed).toHaveLength(1);
    expect(followed[0]?.connected_room).toBe('osaka');
    expect(followed[0]?.drawer_preview).toContain('Osaka stopover');

    const traversed = await traverse(env, auth, { start_room: 'kyoto', max_hops: 2 });
    expect(traversed.results.some((item) => item.room === 'osaka')).toBe(true);

    const stats = await graphStats(env, config, auth);
    expect(stats.total_edges).toBe(1);
    expect(stats.top_tunnels).toHaveLength(1);

    const deleted = await deleteTunnel(env, config, auth, explicit.tunnel_id);
    expect(deleted.success).toBe(true);
    expect((await listTunnels(env, auth, {})).count).toBe(0);
  });

  it('rejects tunnel drawer references that do not belong to the tenant', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const tenantA = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));
    const tenantB = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-b'));

    const foreignDrawer = await addDrawer(env, config, tenantB, {
      wing: 'people',
      room: 'family',
      content: 'Tenant B private drawer.',
    });

    await expect(createTunnel(env, config, tenantA, {
      source_wing: 'travel',
      source_room: 'kyoto',
      target_wing: 'travel',
      target_room: 'osaka',
      source_drawer_id: foreignDrawer.drawer_id,
    })).rejects.toThrow('source_drawer_id must reference an existing drawer for this tenant');
  });
});
