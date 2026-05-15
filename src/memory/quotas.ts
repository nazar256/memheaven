import type { AppConfig, D1DatabaseLike } from '../config';
import type { QuotaSnapshot } from './types';
import { queryFirst, execute, executeResult } from '../storage/d1';
import { utcDay } from '../utils/time';

interface UsageRow {
  tenant_id: string;
  day: string;
  mcp_calls: number;
  reserved_mcp_calls: number;
  memory_reads: number;
  memory_writes: number;
  reserved_memory_writes: number;
  vector_queries: number;
  reserved_vector_queries: number;
  embedding_input_chars: number;
  reserved_embedding_input_chars: number;
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

export type ReservableQuota = keyof QuotaSnapshot['limits'];

const RESERVED_COLUMNS: Record<ReservableQuota, keyof UsageRow> = {
  mcp_calls: 'reserved_mcp_calls',
  memory_writes: 'reserved_memory_writes',
  vector_queries: 'reserved_vector_queries',
  embedding_input_chars: 'reserved_embedding_input_chars',
};

export async function getQuotaSnapshot(
  db: D1DatabaseLike,
  config: AppConfig,
  tenantId: string,
  day = utcDay(),
): Promise<QuotaSnapshot> {
  const row = await queryFirst<UsageRow>(
    db,
    `select tenant_id, day, mcp_calls, reserved_mcp_calls, memory_reads, memory_writes, reserved_memory_writes,
            vector_queries, reserved_vector_queries, embedding_input_chars, reserved_embedding_input_chars, r2_reads, r2_writes
       from usage_counters
       where tenant_id = ? and day = ?`,
    [tenantId, day],
  );

  const base = row ?? {
    tenant_id: tenantId,
    day,
    mcp_calls: 0,
    reserved_mcp_calls: 0,
    memory_reads: 0,
    memory_writes: 0,
    reserved_memory_writes: 0,
    vector_queries: 0,
    reserved_vector_queries: 0,
    embedding_input_chars: 0,
    reserved_embedding_input_chars: 0,
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
        tenant_id, day, mcp_calls, reserved_mcp_calls, memory_reads, memory_writes, reserved_memory_writes,
        vector_queries, reserved_vector_queries, embedding_input_chars, reserved_embedding_input_chars, r2_reads, r2_writes
      ) values (?, ?, ?, 0, ?, ?, 0, ?, 0, ?, 0, ?, ?)
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
  const reserved = snapshot[RESERVED_COLUMNS[requirement]] as number;
  const limit = snapshot.limits[requirement];
  if (used + reserved + additionalAmount > limit) {
    throw new Error(`Quota exceeded for ${requirement}; try again after UTC reset or raise the configured limit`);
  }
}

function statementChanges(result: { meta?: Record<string, unknown> }): number {
  const changes = result.meta?.changes;
  return typeof changes === 'number' ? changes : 0;
}

export async function reserveQuota(
  db: D1DatabaseLike,
  config: AppConfig,
  tenantId: string,
  requirement: ReservableQuota,
  amount: number,
  day = utcDay(),
): Promise<string> {
  if (amount <= 0) {
    return day;
  }
  const limit = config[
    requirement === 'mcp_calls'
      ? 'dailyMaxMcpCallsPerTenant'
      : requirement === 'memory_writes'
        ? 'dailyMaxWritesPerTenant'
        : requirement === 'vector_queries'
          ? 'dailyMaxVectorQueriesPerTenant'
          : 'dailyMaxEmbeddingInputCharsPerTenant'
  ];
  const reservedColumn = RESERVED_COLUMNS[requirement];
  const result = await executeResult(
    db,
    `insert into usage_counters(
        tenant_id, day, mcp_calls, reserved_mcp_calls, memory_reads, memory_writes, reserved_memory_writes,
        vector_queries, reserved_vector_queries, embedding_input_chars, reserved_embedding_input_chars, r2_reads, r2_writes
      ) values (?, ?, 0, ?, 0, 0, ?, 0, ?, 0, ?, 0, 0)
      on conflict(tenant_id, day) do update set
        ${reservedColumn} = ${reservedColumn} + excluded.${reservedColumn}
      where (${requirement} + ${reservedColumn} + ?) <= ?`,
    [
      tenantId,
      day,
      requirement === 'mcp_calls' ? amount : 0,
      requirement === 'memory_writes' ? amount : 0,
      requirement === 'vector_queries' ? amount : 0,
      requirement === 'embedding_input_chars' ? amount : 0,
      amount,
      limit,
    ],
  );
  if (statementChanges(result) === 0 || (result.meta?.changes as number | undefined) === 0) {
    throw new Error(`Quota exceeded for ${requirement}; try again after UTC reset or raise the configured limit`);
  }
  const snapshot = await getQuotaSnapshot(db, config, tenantId, day);
  const reserved = snapshot[RESERVED_COLUMNS[requirement]] as number;
  const used = snapshot[requirement as keyof UsageRow] as number;
  if (used + reserved > snapshot.limits[requirement]) {
    await releaseQuotaReservation(db, tenantId, requirement, amount, day);
    throw new Error(`Quota exceeded for ${requirement}; try again after UTC reset or raise the configured limit`);
  }
  return day;
}

export async function consumeQuotaReservation(
  db: D1DatabaseLike,
  tenantId: string,
  requirement: ReservableQuota,
  amount: number,
  day = utcDay(),
): Promise<void> {
  if (amount <= 0) {
    return;
  }
  const reservedColumn = RESERVED_COLUMNS[requirement];
  await execute(
    db,
    `update usage_counters
        set ${reservedColumn} = max(0, ${reservedColumn} - ?),
            ${requirement} = ${requirement} + ?
      where tenant_id = ? and day = ?`,
    [amount, amount, tenantId, day],
  );
}

export async function releaseQuotaReservation(
  db: D1DatabaseLike,
  tenantId: string,
  requirement: ReservableQuota,
  amount: number,
  day = utcDay(),
): Promise<void> {
  if (amount <= 0) {
    return;
  }
  const reservedColumn = RESERVED_COLUMNS[requirement];
  await execute(
    db,
    `update usage_counters
        set ${reservedColumn} = max(0, ${reservedColumn} - ?)
      where tenant_id = ? and day = ?`,
    [amount, tenantId, day],
  );
}
