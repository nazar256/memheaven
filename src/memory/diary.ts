import type { AppConfig, AppEnv } from '../config';
import type { DiaryEntryRecord, TenantAuthContext } from './types';
import { writeAuditLog } from './audit';
import { consumeQuotaReservation, incrementUsage, releaseQuotaReservation, reserveQuota } from './quotas';
import { queryAll, queryFirst, execute } from '../storage/d1';
import { getText, putText } from '../storage/r2';
import { requireBinding } from './index';
import { deterministicId, objectKeySegment, sha256Hex } from '../utils/ids';
import { nowIso } from '../utils/time';
import { sanitizeSimpleText } from '../security/validators';

export interface DiaryWriteInput {
  agent_name: string;
  entry: string;
  topic?: string;
  wing?: string;
}

export interface DiaryReadInput {
  agent_name: string;
  last_n?: number;
  wing?: string;
}

function diaryKey(tenantId: string, agentName: string, entryId: string): string {
  return `tenants/${objectKeySegment(tenantId)}/diary/${objectKeySegment(agentName)}/${objectKeySegment(entryId)}.md`;
}

export async function diaryWrite(env: AppEnv, config: AppConfig, auth: TenantAuthContext, input: DiaryWriteInput) {
  const db = requireBinding(env.DB, 'DB');
  const bucket = requireBinding(env.MEMORY_BUCKET, 'MEMORY_BUCKET');
  const reservationDay = await reserveQuota(db, config, auth.tenantId, 'memory_writes', 1);

  const agentName = sanitizeSimpleText(input.agent_name.toLowerCase(), 'agent_name');
  const topic = sanitizeSimpleText(input.topic ?? 'session', 'topic', 120);
  const entry = input.entry.trim();
  if (!entry) {
    throw new Error('entry is required');
  }

  const createdAt = nowIso();
  const entryId = await deterministicId('diary', [auth.tenantId, agentName, topic, createdAt]);
  const r2Key = diaryKey(auth.tenantId, agentName, entryId);
  try {
    await putText(bucket, r2Key, entry);
    const contentHash = await sha256Hex(entry);
    await execute(
      db,
      `insert into diary_entries(id, tenant_id, agent_name, topic, r2_key, content_hash, created_at)
       values (?, ?, ?, ?, ?, ?, ?)`,
      [entryId, auth.tenantId, agentName, topic, r2Key, contentHash, createdAt],
    );
    await consumeQuotaReservation(db, auth.tenantId, 'memory_writes', 1, reservationDay);
    await incrementUsage(db, auth.tenantId, { r2_writes: 1 });
    await writeAuditLog(db, auth.tenantId, 'diary_write', { agent_name: agentName, topic, entry }, { success: true, entry_id: entryId });
    return {
      success: true,
      entry_id: entryId,
      agent: agentName,
      topic,
      timestamp: createdAt,
      wing: input.wing ?? `wing_${agentName}`,
    };
  } catch (error) {
    await releaseQuotaReservation(db, auth.tenantId, 'memory_writes', 1, reservationDay);
    throw error;
  }
}

export async function diaryRead(env: AppEnv, _config: AppConfig, auth: TenantAuthContext, input: DiaryReadInput) {
  const db = requireBinding(env.DB, 'DB');
  const bucket = requireBinding(env.MEMORY_BUCKET, 'MEMORY_BUCKET');
  const agentName = sanitizeSimpleText(input.agent_name.toLowerCase(), 'agent_name');
  const lastN = Math.min(Math.max(1, input.last_n ?? 10), 100);
  const rows = await queryAll<DiaryEntryRecord>(
    db,
    `select id, tenant_id, agent_name, topic, r2_key, content_hash, created_at
       from diary_entries
      where tenant_id = ? and agent_name = ?
      order by created_at desc
      limit ?`,
    [auth.tenantId, agentName, lastN],
  );

  const entries = [] as Array<{ date: string; timestamp: string; topic: string; content: string }>;
  for (const row of rows) {
    const content = (await getText(bucket, row.r2_key)) ?? '';
    entries.push({
      date: row.created_at.slice(0, 10),
      timestamp: row.created_at,
      topic: row.topic,
      content,
    });
  }
  await incrementUsage(db, auth.tenantId, { memory_reads: entries.length, r2_reads: entries.length });
  const total = await queryFirst<{ total: number }>(
    db,
    `select count(*) as total from diary_entries where tenant_id = ? and agent_name = ?`,
    [auth.tenantId, agentName],
  );

  return { agent: agentName, entries, total: total?.total ?? 0, showing: entries.length, wing: input.wing ?? null };
}
