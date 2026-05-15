import { describe, expect, it } from 'vitest';

import { requireConfig } from '../src/config';
import { addDrawer } from '../src/memory/drawers';
import { consumeQuotaReservation, ensureQuotaAvailable, getQuotaSnapshot, incrementUsage, releaseQuotaReservation, reserveQuota } from '../src/memory/quotas';
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

  it('reserves, consumes, and releases limited quota atomically', async () => {
    const env = await createEnvWithKeys();
    const config = { ...requireConfig(env), dailyMaxWritesPerTenant: 1 };
    const auth = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));
    const db = env.DB!;

    const reservationDay = await reserveQuota(db, config, auth.tenantId, 'memory_writes', 1);
    await expect(reserveQuota(db, config, auth.tenantId, 'memory_writes', 1)).rejects.toThrow('Quota exceeded');

    await releaseQuotaReservation(db, auth.tenantId, 'memory_writes', 1, reservationDay);
    const secondReservationDay = await reserveQuota(db, config, auth.tenantId, 'memory_writes', 1);
    await consumeQuotaReservation(db, auth.tenantId, 'memory_writes', 1, secondReservationDay);

    const snapshot = await getQuotaSnapshot(db, config, auth.tenantId);
    expect(snapshot.memory_writes).toBe(1);
    expect(snapshot.reserved_memory_writes).toBe(0);
  });

  it('rejects first reservation when amount exceeds configured limit', async () => {
    const env = await createEnvWithKeys();
    const config = { ...requireConfig(env), dailyMaxVectorQueriesPerTenant: 1 };
    const auth = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));

    await expect(reserveQuota(env.DB!, config, auth.tenantId, 'vector_queries', 2)).rejects.toThrow('Quota exceeded');
  });
});
