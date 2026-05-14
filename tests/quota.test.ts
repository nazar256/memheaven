import { describe, expect, it } from 'vitest';

import { requireConfig } from '../src/config';
import { addDrawer } from '../src/memory/drawers';
import { ensureQuotaAvailable, getQuotaSnapshot, incrementUsage } from '../src/memory/quotas';
import { createEnvWithKeys, mintDirectAccessToken, verifyDirectAccessToken } from './helpers/testData';

describe('quota tracking', async () => {
  it('increments counters and blocks when over limit', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const auth = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));
    const db = env.DB!;

    await incrementUsage(db, auth.tenantId, { mcp_calls: 1, vector_queries: 2, embedding_input_chars: 50 });
    const snapshot = await getQuotaSnapshot(db, config, auth.tenantId);
    expect(snapshot.mcp_calls).toBe(1);
    expect(snapshot.vector_queries).toBe(2);

    await incrementUsage(db, auth.tenantId, { memory_writes: config.dailyMaxWritesPerTenant });
    await expect(ensureQuotaAvailable(db, config, auth.tenantId, 'memory_writes', 1)).rejects.toThrow('Quota exceeded');

    const restrictedConfig = { ...config, dailyMaxWritesPerTenant: 0 };
    await expect(addDrawer(env, restrictedConfig, auth, { wing: 'quota', room: 'limit', content: 'This write should fail.' })).rejects.toThrow('Quota exceeded');
  });
});
