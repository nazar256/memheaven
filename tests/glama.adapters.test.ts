import { describe, expect, it } from 'vitest';

import { DeterministicAiBinding, deterministicEmbedding } from '../glama/adapters/ai-deterministic';
import { createSqlJsD1Database, migrationFiles } from '../glama/adapters/d1-sqljs';
import { MemoryR2Bucket } from '../glama/adapters/r2-memory';
import { MemoryVectorizeIndex } from '../glama/adapters/vector-memory';

describe('Glama sql.js D1 adapter', () => {
  it('applies the numbered migrations and supports first/all/run with real SQL', async () => {
    const db = await createSqlJsD1Database();
    try {
      expect(migrationFiles()).toEqual([
        '0001_initial.sql',
        '0002_auth_and_quota_hardening.sql',
        '0003_diary_scope_and_search.sql',
      ]);

      const insert = await db.prepare(
        `insert into usage_counters(
          tenant_id, day, mcp_calls, reserved_mcp_calls, memory_reads, memory_writes,
          reserved_memory_writes, vector_queries, reserved_vector_queries,
          embedding_input_chars, reserved_embedding_input_chars, r2_reads, r2_writes
        ) values (?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)`,
      ).bind('glama-test', '2026-08-11', 2).run();
      expect(insert.success).toBe(true);
      expect(insert.meta?.changes).toBe(1);

      const row = await db.prepare(
        'select tenant_id, day, mcp_calls from usage_counters where tenant_id = ? and day = ?',
      ).bind('glama-test', '2026-08-11').first<{ tenant_id: string; day: string; mcp_calls: number }>();
      expect(row).toEqual({ tenant_id: 'glama-test', day: '2026-08-11', mcp_calls: 2 });

      const rows = await db.prepare('select tenant_id, day from usage_counters where tenant_id = ?').bind('glama-test').all();
      expect(rows.success).toBe(true);
      expect(rows.results).toHaveLength(1);

      const noMatch = await db.prepare('update usage_counters set mcp_calls = mcp_calls + 1 where tenant_id = ?').bind('missing').run();
      expect(noMatch.meta?.changes).toBe(0);
    } finally {
      db.sqlite.close();
    }
  });

  it('commits a batch and rolls it back atomically when one statement fails', async () => {
    const db = await createSqlJsD1Database();
    try {
      expect((await db.prepare('create table batch_probe(id text primary key, value text not null)').run()).success).toBe(true);
      await db.batch([
        db.prepare('insert into batch_probe(id, value) values (?, ?)').bind('committed', 'yes'),
        db.prepare('insert into batch_probe(id, value) values (?, ?)').bind('committed-2', 'yes'),
      ]);
      const committed = await db.prepare('select count(*) as count from batch_probe').first<{ count: number }>();
      expect(committed?.count).toBe(2);

      await expect(db.batch([
        db.prepare('insert into batch_probe(id, value) values (?, ?)').bind('rolled-back', 'yes'),
        db.prepare('insert into batch_probe(id, value) values (?, ?)').bind('committed', 'duplicate'),
      ])).rejects.toThrow();

      const afterRollback = await db.prepare('select count(*) as count from batch_probe').first<{ count: number }>();
      expect(afterRollback?.count).toBe(2);
      const rolledBack = await db.prepare('select id from batch_probe where id = ?').bind('rolled-back').first();
      expect(rolledBack).toBeNull();
    } finally {
      db.sqlite.close();
    }
  });
});

describe('Glama R2 adapter', () => {
  it('supports put, get, overwrite, delete, and missing objects', async () => {
    const bucket = new MemoryR2Bucket();
    expect(await bucket.get('missing')).toBeNull();
    await bucket.put('note', 'first');
    expect(await (await bucket.get('note'))?.text()).toBe('first');
    await bucket.put('note', 'second');
    expect(await (await bucket.get('note'))?.body?.text()).toBe('second');
    await bucket.delete('note');
    expect(await bucket.get('note')).toBeNull();
  });
});

describe('Glama deterministic AI adapter', () => {
  it('is deterministic, normalized, finite, dimensioned, and batches inputs', async () => {
    const binding = new DeterministicAiBinding(8);
    const single = await binding.run('deterministic-local', { text: 'alpha' }) as { shape: number[]; data: number[][] };
    const repeated = await binding.run('deterministic-local', { text: 'alpha' }) as { shape: number[]; data: number[][] };
    const batch = await binding.run('deterministic-local', { text: ['alpha', 'beta'] }) as { shape: number[]; data: number[][] };

    expect(single.shape).toEqual([1, 8]);
    expect(single.data).toEqual(repeated.data);
    expect(batch.shape).toEqual([2, 8]);
    expect(batch.data).toHaveLength(2);
    for (const vector of batch.data) {
      expect(vector).toHaveLength(8);
      expect(vector.every(Number.isFinite)).toBe(true);
      expect(Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))).toBeCloseTo(1);
    }
    expect(deterministicEmbedding('', 8)).toEqual(Array.from({ length: 8 }, () => 0));
  });
});

describe('Glama in-memory vector adapter', () => {
  it('supports cosine ordering, topK, filters, namespaces, get, and delete', async () => {
    const index = new MemoryVectorizeIndex(3);
    await index.upsert([
      { id: 'a-near', namespace: 'tenant_a', values: [1, 0, 0], metadata: { tenant_id: 'a', kind: 'drawer', wing: 'work' } },
      { id: 'a-second', namespace: 'tenant_a', values: [0.8, 0.6, 0], metadata: { tenant_id: 'a', kind: 'diary', wing: 'work' } },
      { id: 'a-other-wing', namespace: 'tenant_a', values: [0, 1, 0], metadata: { tenant_id: 'a', kind: 'drawer', wing: 'personal' } },
      { id: 'b-near', namespace: 'tenant_b', values: [1, 0, 0], metadata: { tenant_id: 'b', kind: 'drawer', wing: 'work' } },
    ]);

    const filtered = await index.query([1, 0, 0], {
      namespace: 'tenant_a',
      topK: 2,
      filter: { tenant_id: 'a', wing: 'work' },
    });
    expect(filtered.matches.map((match) => match.id)).toEqual(['a-near', 'a-second']);
    expect(filtered.matches[0]?.score).toBeGreaterThan(filtered.matches[1]?.score ?? 0);

    const otherTenant = await index.query([1, 0, 0], { namespace: 'tenant_b', topK: 5, filter: { tenant_id: 'b' } });
    expect(otherTenant.matches.map((match) => match.id)).toEqual(['b-near']);
    expect(await index.getByIds(['a-near', 'missing'])).toHaveLength(1);

    await index.deleteByIds(['a-near']);
    expect(await index.getByIds(['a-near'])).toEqual([]);
    expect((await index.describe()).vectorCount).toBe(3);
  });
});
