import type { AppConfig, D1DatabaseLike } from '../config';
import type { QuotaSnapshot } from './types';
import { queryFirst, execute } from '../storage/d1';
import { utcDay } from '../utils/time';

interface UsageRow {
  tenant_id: string;
  day: string;
  mcp_calls: number;
  memory_reads: number;
  memory_writes: number;
  vector_queries: number;
  embedding_input_chars: number;
  r2_reads: number;
  r2_writes: number;
}

export interface UsageIncrement {
  mcp_calls?: number;
  memory_reads?: number;
  memory_writes?: number;
  vector_queries?: number;
  embedding_input_chars?: number;
  r2_reads?: number;
  r2_writes?: number;
}

export async function getQuotaSnapshot(
  db: D1DatabaseLike,
  config: AppConfig,
  tenantId: string,
  day = utcDay(),
): Promise<QuotaSnapshot> {
  const row = await queryFirst<UsageRow>(
    db,
    `select tenant_id, day, mcp_calls, memory_reads, memory_writes, vector_queries, embedding_input_chars, r2_reads, r2_writes
       from usage_counters
      where tenant_id = ? and day = ?`,
    [tenantId, day],
  );

  const base = row ?? {
    tenant_id: tenantId,
    day,
    mcp_calls: 0,
    memory_reads: 0,
    memory_writes: 0,
    vector_queries: 0,
    embedding_input_chars: 0,
    r2_reads: 0,
    r2_writes: 0,
  };

  return {
    ...base,
    limits: {
      mcp_calls: config.dailyMaxMcpCallsPerTenant,
      memory_writes: config.dailyMaxWritesPerTenant,
      vector_queries: config.dailyMaxVectorQueriesPerTenant,
      embedding_input_chars: config.dailyMaxEmbeddingInputCharsPerTenant,
    },
  };
}

export async function incrementUsage(
  db: D1DatabaseLike,
  tenantId: string,
  increment: UsageIncrement,
  day = utcDay(),
): Promise<void> {
  await execute(
    db,
    `insert into usage_counters(
        tenant_id, day, mcp_calls, memory_reads, memory_writes, vector_queries, embedding_input_chars, r2_reads, r2_writes
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(tenant_id, day) do update set
        mcp_calls = mcp_calls + excluded.mcp_calls,
        memory_reads = memory_reads + excluded.memory_reads,
        memory_writes = memory_writes + excluded.memory_writes,
        vector_queries = vector_queries + excluded.vector_queries,
        embedding_input_chars = embedding_input_chars + excluded.embedding_input_chars,
        r2_reads = r2_reads + excluded.r2_reads,
        r2_writes = r2_writes + excluded.r2_writes`,
    [
      tenantId,
      day,
      increment.mcp_calls ?? 0,
      increment.memory_reads ?? 0,
      increment.memory_writes ?? 0,
      increment.vector_queries ?? 0,
      increment.embedding_input_chars ?? 0,
      increment.r2_reads ?? 0,
      increment.r2_writes ?? 0,
    ],
  );
}

export async function ensureQuotaAvailable(
  db: D1DatabaseLike,
  config: AppConfig,
  tenantId: string,
  requirement: keyof QuotaSnapshot['limits'],
  additionalAmount: number,
): Promise<void> {
  const snapshot = await getQuotaSnapshot(db, config, tenantId);
  const used = snapshot[requirement as keyof UsageRow] as number;
  const limit = snapshot.limits[requirement];
  if (used + additionalAmount > limit) {
    throw new Error(`Quota exceeded for ${requirement}; try again after UTC reset or raise the configured limit`);
  }
}
