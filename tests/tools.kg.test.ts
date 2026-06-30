import { describe, expect, it } from 'vitest';

import { requireConfig } from '../src/config';
import { addDrawer, deleteDrawer, updateDrawer } from '../src/memory/drawers';
import { kgAdd, kgCheck, kgInvalidate, kgQuery, kgStats, kgTimeline } from '../src/memory/kg';
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

  it('validates add interval bounds with date-only semantics', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const auth = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));

    await expect(
      kgAdd(env, config, auth, { subject: 'Yurii', predicate: 'likes', object: 'TypeScript', valid_from: '2026-01-02', valid_to: '2026-01-01' }),
    ).rejects.toThrow('valid_to must not be earlier than valid_from');

    await expect(
      kgAdd(env, config, auth, { subject: 'Yurii', predicate: 'likes', object: 'TypeScript', valid_from: '2026-01-01', valid_to: '2026-01-01' }),
    ).resolves.toMatchObject({ success: true, fact: { valid_from: '2026-01-01', valid_to: '2026-01-01' } });

    await expect(
      kgAdd(env, config, auth, { subject: 'Yurii', predicate: 'uses', object: 'D1', valid_from: '2026-01-01' }),
    ).resolves.toMatchObject({ success: true });
    await expect(
      kgAdd(env, config, auth, { subject: 'Yurii', predicate: 'uses', object: 'R2', valid_to: '2026-01-01' }),
    ).resolves.toMatchObject({ success: true });
  });

  it('rejects invalidation that would invert a matching interval without mutating rows', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const auth = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));

    await kgAdd(env, config, auth, { subject: 'Yurii', predicate: 'likes', object: 'TypeScript', valid_from: '2026-01-01' });

    await expect(
      kgInvalidate(env, config, auth, { subject: 'Yurii', predicate: 'likes', object: 'TypeScript', ended: '2020-01-01' }),
    ).rejects.toThrow('ended must not be earlier than valid_from');

    const timeline = await kgTimeline(env, auth, { entity: 'Yurii' });
    expect(timeline.timeline[0]?.valid_to).toBeNull();
  });

  it('accepts invalidation at valid_from and for open-start rows', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const auth = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));

    await kgAdd(env, config, auth, { subject: 'Yurii', predicate: 'status', object: 'active', valid_from: '2026-01-01' });
    await expect(
      kgInvalidate(env, config, auth, { subject: 'Yurii', predicate: 'status', object: 'active', ended: '2026-01-01' }),
    ).resolves.toMatchObject({ success: true, ended: '2026-01-01' });

    await kgAdd(env, config, auth, { subject: 'Yurii', predicate: 'role', object: 'maintainer' });
    await expect(
      kgInvalidate(env, config, auth, { subject: 'Yurii', predicate: 'role', object: 'maintainer', ended: '2020-01-01' }),
    ).resolves.toMatchObject({ success: true, ended: '2020-01-01' });
  });

  it('uses temporal end semantics when invalidating mixed date-only and datetime bounds', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const auth = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));

    await kgAdd(env, config, auth, {
      subject: 'Yurii',
      predicate: 'available_until',
      object: 'noon',
      valid_from: '2026-01-01T00:00:00.000Z',
      valid_to: '2026-01-01T12:00:00.000Z',
    });

    await expect(
      kgInvalidate(env, config, auth, { subject: 'Yurii', predicate: 'available_until', object: 'noon', ended: '2026-01-01' }),
    ).resolves.toMatchObject({ success: true, ended: '2026-01-01' });

    const timeline = await kgTimeline(env, auth, { entity: 'Yurii' });
    expect(timeline.timeline[0]?.valid_to).toBe('2026-01-01T12:00:00.000Z');
  });

  it('rejects multi-row invalidation without partial updates when any matching row would invert', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const auth = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));

    await kgAdd(env, config, auth, { subject: 'Yurii', predicate: 'works_on', object: 'MemHeaven', valid_from: '2020-01-01' });
    await kgAdd(env, config, auth, { subject: 'Yurii', predicate: 'works_on', object: 'MemHeaven', valid_from: '2030-01-01' });

    await expect(
      kgInvalidate(env, config, auth, { subject: 'Yurii', predicate: 'works_on', object: 'MemHeaven', ended: '2026-01-01' }),
    ).rejects.toThrow('ended must not be earlier than valid_from');

    const timeline = await kgTimeline(env, auth, { entity: 'Yurii' });
    expect(timeline.timeline.filter((item) => item.predicate === 'works_on').map((item) => item.valid_to)).toEqual([null, null]);
  });

  it('keeps invalidation preflight tenant-scoped', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const authA = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));
    const authB = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-b'));

    await kgAdd(env, config, authA, { subject: 'Yurii', predicate: 'status', object: 'active', valid_from: '2030-01-01' });

    await expect(
      kgInvalidate(env, config, authB, { subject: 'Yurii', predicate: 'status', object: 'active', ended: '2020-01-01' }),
    ).resolves.toMatchObject({ success: true, ended: '2020-01-01' });

    const tenantATimeline = await kgTimeline(env, authA, { entity: 'Yurii' });
    expect(tenantATimeline.timeline[0]?.valid_to).toBeNull();
  });

  it('reports active conflicts only for known single-valued predicates', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const auth = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));

    await kgAdd(env, config, auth, { subject: 'MemHeaven', predicate: 'status', object: 'active', valid_from: '2026-01-01' });
    await kgAdd(env, config, auth, { subject: 'MemHeaven', predicate: 'status', object: 'paused', valid_from: '2026-01-02' });
    await kgAdd(env, config, auth, { subject: 'MemHeaven', predicate: 'uses', object: 'D1', valid_from: '2026-01-01' });
    await kgAdd(env, config, auth, { subject: 'MemHeaven', predicate: 'uses', object: 'R2', valid_from: '2026-01-01' });

    const check = await kgCheck(env, auth, { entity: 'MemHeaven', as_of: '2026-02-01' });

    expect(check.summary.active_conflicts).toBe(1);
    expect(check.conflicts[0]).toMatchObject({
      code: 'active_conflict',
      subject: 'MemHeaven',
      predicate: 'status',
      objects: ['active', 'paused'],
    });
    expect(check.conflicts.some((conflict) => conflict.predicate === 'uses')).toBe(false);
  });

  it('reports stale current-state facts but not durable facts by default', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const auth = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));

    await kgAdd(env, config, auth, { subject: 'MemHeaven', predicate: 'status', object: 'migrating', valid_from: '2026-01-01' });
    await kgAdd(env, config, auth, { subject: 'Yurii', predicate: 'prefers', object: 'clear code', valid_from: '2020-01-01' });

    const check = await kgCheck(env, auth, { as_of: '2026-04-15', older_than_days: 30 });

    expect(check.stale_facts).toHaveLength(1);
    expect(check.stale_facts[0]?.fact).toMatchObject({ subject: 'MemHeaven', predicate: 'status', object: 'migrating' });
    expect(check.stale_facts[0]?.age_days).toBeGreaterThanOrEqual(30);
  });

  it('reports missing, deleted, and updated source drawer warnings', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const auth = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));
    const deletedSource = await addDrawer(env, config, auth, { wing: 'projects', room: 'memheaven', content: 'MemHeaven status source.' });
    const updatedSource = await addDrawer(env, config, auth, { wing: 'projects', room: 'memheaven', content: 'MemHeaven role source.' });

    await kgAdd(env, config, auth, { subject: 'MemHeaven', predicate: 'status', object: 'active', source_drawer_id: deletedSource.drawer_id });
    await kgAdd(env, config, auth, { subject: 'MemHeaven', predicate: 'current_role', object: 'memory server', source_drawer_id: updatedSource.drawer_id });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await deleteDrawer(env, config, auth, deletedSource.drawer_id);
    await updateDrawer(env, config, auth, { drawer_id: updatedSource.drawer_id, content: 'MemHeaven role source changed.' });
    await env.DB!.prepare(
      `insert into kg_triples(id, tenant_id, subject, predicate, object, valid_from, valid_to, confidence, source_drawer_id, source_closet, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind('manual-missing-source', 'tenant-a', 'MemHeaven', 'assigned_to', 'Yurii', null, null, null, 'drawer_missing', null, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z').run();

    const check = await kgCheck(env, auth, { entity: 'MemHeaven', as_of: '2026-02-01' });
    const codes = check.source_warnings.map((warning) => warning.code);

    expect(codes).toContain('source_missing');
    expect(codes).toContain('source_deleted');
    expect(codes).toContain('source_updated_after_fact');
  });

  it('keeps kg checks tenant-scoped and honors as-of active windows', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const authA = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));
    const authB = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-b'));

    await kgAdd(env, config, authA, { subject: 'Aurora', predicate: 'status', object: 'planned', valid_from: '2026-01-01', valid_to: '2026-02-01' });
    await kgAdd(env, config, authA, { subject: 'Aurora', predicate: 'status', object: 'active', valid_from: '2026-03-01' });
    await kgAdd(env, config, authB, { subject: 'Aurora', predicate: 'status', object: 'private-tenant-b', valid_from: '2026-01-01' });

    const beforeFuture = await kgCheck(env, authA, { entity: 'Aurora', as_of: '2026-02-15' });
    const afterFuture = await kgCheck(env, authA, { entity: 'Aurora', as_of: '2026-03-15' });

    expect(beforeFuture.conflicts).toHaveLength(0);
    expect(beforeFuture.stale_facts).toHaveLength(0);
    expect(afterFuture.stale_facts.map((item) => item.fact.object)).not.toContain('private-tenant-b');
    expect(afterFuture.source_warnings).toHaveLength(0);
  });
});
