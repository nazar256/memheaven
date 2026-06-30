import type { AppConfig, AppEnv } from '../config';
import type { D1DatabaseLike } from '../config';
import type { ChunkedText, DiaryChunkRecord, DiaryEntryRecord, DiarySearchResultItem, TenantAuthContext } from './types';
import { writeAuditLog } from './audit';
import { chunkText } from './chunking';
import { embedText, embedTexts } from './embeddings';
import { consumeQuotaReservation, incrementUsage, releaseQuotaReservation, reserveQuota } from './quotas';
import { queryAll, queryFirst, execute, executeBatch, placeholders } from '../storage/d1';
import { getText, putText } from '../storage/r2';
import { requireBinding } from './index';
import { deterministicId, objectKeySegment, sha256Hex, shortHash } from '../utils/ids';
import { nowIso } from '../utils/time';
import { sanitizeSimpleText } from '../security/validators';
import { deleteVectors, queryVectors, upsertVectors, type VectorMetadata } from './vectorizeIndex';

export interface DiaryWriteInput {
  agent_name: string;
  entry: string;
  topic?: string;
  wing?: string;
  room?: string;
}

export interface DiaryReadInput {
  agent_name: string;
  last_n?: number;
  wing?: string;
  room?: string;
}

export interface DiarySearchInput {
  agent_name: string;
  query: string;
  limit?: number;
  wing?: string;
  room?: string;
  topic?: string;
  max_distance?: number;
  context?: string;
}

export interface DiaryReindexInput {
  entry_id?: string;
  agent_name?: string;
  wing?: string;
  room?: string;
  topic?: string;
  limit?: number;
  offset?: number;
  dry_run?: boolean;
}

function diaryKey(tenantId: string, agentName: string, entryId: string): string {
  return `tenants/${objectKeySegment(tenantId)}/diary/${objectKeySegment(agentName)}/${objectKeySegment(entryId)}.md`;
}

function previewText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

function defaultWing(agentName: string): string {
  return `wing_${agentName}`;
}

async function diaryVectorIdFor(tenantId: string, diaryId: string, chunkIndex: number, contentHash: string): Promise<string> {
  const tenantHash = await shortHash(tenantId, 8);
  const diaryHash = await shortHash(`${diaryId}:${contentHash}`, 12);
  return `dv1_${tenantHash}_${diaryHash}_${chunkIndex}`.slice(0, 64);
}

async function ensureDiaryVectorMetadata(
  env: AppEnv,
  config: AppConfig,
  tenantId: string,
  entryId: string,
  agentName: string,
  topic: string,
  wing: string,
  room: string,
  contentHash: string,
  chunks: ChunkedText[],
  createdAt: string,
): Promise<{ vectorRows: DiaryChunkRecord[] }> {
  if (chunks.length === 0) {
    return { vectorRows: [] };
  }

  const db = requireBinding(env.DB, 'DB');
  const embeddingChars = chunks.reduce((sum, chunk) => sum + chunk.charCount, 0);
  const reservationDay = await reserveQuota(db, config, tenantId, 'embedding_input_chars', embeddingChars);
  try {
    const embeddings = await embedTexts(env, config, chunks.map((chunk) => chunk.text));

    const vectorRows: DiaryChunkRecord[] = [];
    const vectors = await Promise.all(
      chunks.map(async (chunk, index) => {
        const embedding = embeddings[index];
        if (!embedding) {
          throw new Error(`Missing embedding for diary chunk ${chunk.chunkIndex}`);
        }
        const vectorId = await diaryVectorIdFor(tenantId, entryId, chunk.chunkIndex, contentHash);
        const metadata: VectorMetadata = {
          tenant_id: tenantId,
          diary_id: entryId,
          agent_name: agentName,
          topic,
          wing,
          room,
          chunk_index: chunk.chunkIndex,
          kind: 'diary',
          created_at: createdAt,
        };
        vectorRows.push({
          id: await deterministicId('diary_chunk', [tenantId, entryId, chunk.chunkIndex]),
          tenant_id: tenantId,
          diary_id: entryId,
          chunk_index: chunk.chunkIndex,
          vector_id: vectorId,
          chunk_text: chunk.text,
          chunk_chars: chunk.charCount,
          created_at: createdAt,
        });
        return {
          id: vectorId,
          values: embedding,
          metadata,
        };
      }),
    );

    await upsertVectors(env, tenantId, vectors);
    await consumeQuotaReservation(db, tenantId, 'embedding_input_chars', embeddingChars, reservationDay);

    return { vectorRows };
  } catch (error) {
    await releaseQuotaReservation(db, tenantId, 'embedding_input_chars', embeddingChars, reservationDay);
    throw error;
  }
}

async function insertDiaryChunkRows(db: D1DatabaseLike, rows: DiaryChunkRecord[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  await executeBatch(
    db,
    rows.map((row) => ({
      query: `insert into diary_chunks(id, tenant_id, diary_id, chunk_index, vector_id, chunk_text, chunk_chars, created_at)
              values (?, ?, ?, ?, ?, ?, ?, ?)`,
      values: [row.id, row.tenant_id, row.diary_id, row.chunk_index, row.vector_id, row.chunk_text, row.chunk_chars, row.created_at],
    })),
  );
}

async function listDiaryChunkRows(db: D1DatabaseLike, tenantId: string, diaryId: string): Promise<DiaryChunkRecord[]> {
  return queryAll<DiaryChunkRecord>(
    db,
    `select id, tenant_id, diary_id, chunk_index, vector_id, chunk_text, chunk_chars, created_at
       from diary_chunks
      where tenant_id = ? and diary_id = ?
      order by chunk_index asc`,
    [tenantId, diaryId],
  );
}

async function deleteDiaryChunkRows(db: D1DatabaseLike, tenantId: string, diaryId: string): Promise<void> {
  await execute(db, `delete from diary_chunks where tenant_id = ? and diary_id = ?`, [tenantId, diaryId]);
}

async function reindexDiaryEntry(
  env: AppEnv,
  config: AppConfig,
  auth: TenantAuthContext,
  entry: DiaryEntryRecord,
): Promise<number> {
  const db = requireBinding(env.DB, 'DB');
  const bucket = requireBinding(env.MEMORY_BUCKET, 'MEMORY_BUCKET');
  const content = await getText(bucket, entry.r2_key);
  if (content === null) {
    throw new Error('diary body is missing from R2');
  }

  const contentHash = await sha256Hex(content);
  const chunks = chunkText(content);
  const { vectorRows } = await ensureDiaryVectorMetadata(
    env,
    config,
    auth.tenantId,
    entry.id,
    entry.agent_name,
    entry.topic,
    entry.wing,
    entry.room,
    contentHash,
    chunks,
    entry.created_at,
  );
  const existingChunks = await listDiaryChunkRows(db, auth.tenantId, entry.id);
  const nextVectorIds = new Set(vectorRows.map((row) => row.vector_id));
  const staleVectorIds = existingChunks.map((row) => row.vector_id).filter((id) => !nextVectorIds.has(id));

  await deleteDiaryChunkRows(db, auth.tenantId, entry.id);
  await insertDiaryChunkRows(db, vectorRows);
  await deleteVectors(env, staleVectorIds);
  return chunks.length;
}

export async function diaryWrite(env: AppEnv, config: AppConfig, auth: TenantAuthContext, input: DiaryWriteInput) {
  const db = requireBinding(env.DB, 'DB');
  const bucket = requireBinding(env.MEMORY_BUCKET, 'MEMORY_BUCKET');
  const reservationDay = await reserveQuota(db, config, auth.tenantId, 'memory_writes', 1);

  const agentName = sanitizeSimpleText(input.agent_name.toLowerCase(), 'agent_name');
  const topic = sanitizeSimpleText(input.topic ?? 'session', 'topic', 120);
  const wing = sanitizeSimpleText(input.wing ?? defaultWing(agentName), 'wing');
  const room = sanitizeSimpleText(input.room ?? 'diary', 'room');
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
    const chunks = chunkText(entry);
    const { vectorRows } = await ensureDiaryVectorMetadata(env, config, auth.tenantId, entryId, agentName, topic, wing, room, contentHash, chunks, createdAt);
    await execute(
      db,
      `insert into diary_entries(id, tenant_id, agent_name, topic, wing, room, r2_key, content_hash, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [entryId, auth.tenantId, agentName, topic, wing, room, r2Key, contentHash, createdAt, createdAt],
    );
    await insertDiaryChunkRows(db, vectorRows);
    await consumeQuotaReservation(db, auth.tenantId, 'memory_writes', 1, reservationDay);
    await incrementUsage(db, auth.tenantId, { r2_writes: 1 });
    await writeAuditLog(db, auth.tenantId, 'diary_write', { agent_name: agentName, topic, wing, room, entry }, { success: true, entry_id: entryId, chunks: chunks.length });
    return {
      success: true,
      entry_id: entryId,
      agent: agentName,
      topic,
      timestamp: createdAt,
      wing,
      room,
      chunks: chunks.length,
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
  const filters: string[] = ['tenant_id = ?', 'agent_name = ?'];
  const values: unknown[] = [auth.tenantId, agentName];
  const wing = input.wing ? sanitizeSimpleText(input.wing, 'wing') : undefined;
  const room = input.room ? sanitizeSimpleText(input.room, 'room') : undefined;
  if (wing) {
    filters.push('wing = ?');
    values.push(wing);
  }
  if (room) {
    filters.push('room = ?');
    values.push(room);
  }
  const where = filters.join(' and ');
  const rows = await queryAll<DiaryEntryRecord>(
    db,
    `select id, tenant_id, agent_name, topic, wing, room, r2_key, content_hash, created_at, updated_at
       from diary_entries
      where ${where}
      order by created_at desc
      limit ?`,
    [...values, lastN],
  );

  const entries = [] as Array<{ date: string; timestamp: string; topic: string; wing: string; room: string; content: string }>;
  for (const row of rows) {
    const content = (await getText(bucket, row.r2_key)) ?? '';
    entries.push({
      date: row.created_at.slice(0, 10),
      timestamp: row.created_at,
      topic: row.topic,
      wing: row.wing,
      room: row.room,
      content,
    });
  }
  await incrementUsage(db, auth.tenantId, { memory_reads: entries.length, r2_reads: entries.length });
  const total = await queryFirst<{ total: number }>(
    db,
    `select count(*) as total from diary_entries where ${where}`,
    values,
  );

  return { agent: agentName, entries, total: total?.total ?? 0, showing: entries.length, wing: wing ?? null, room: room ?? null };
}

export async function diaryReindex(env: AppEnv, config: AppConfig, auth: TenantAuthContext, input: DiaryReindexInput) {
  const db = requireBinding(env.DB, 'DB');
  const limit = Math.min(Math.max(1, input.limit ?? 50), 100);
  const offset = Math.max(0, input.offset ?? 0);
  const filters: string[] = ['tenant_id = ?'];
  const values: unknown[] = [auth.tenantId];
  const entryId = input.entry_id ? sanitizeSimpleText(input.entry_id, 'entry_id', 128) : undefined;
  const agentName = input.agent_name ? sanitizeSimpleText(input.agent_name.toLowerCase(), 'agent_name') : undefined;
  const wing = input.wing ? sanitizeSimpleText(input.wing, 'wing') : undefined;
  const room = input.room ? sanitizeSimpleText(input.room, 'room') : undefined;
  const topic = input.topic ? sanitizeSimpleText(input.topic, 'topic', 120) : undefined;

  if (entryId) {
    filters.push('id = ?');
    values.push(entryId);
  }
  if (agentName) {
    filters.push('agent_name = ?');
    values.push(agentName);
  }
  if (wing) {
    filters.push('wing = ?');
    values.push(wing);
  }
  if (room) {
    filters.push('room = ?');
    values.push(room);
  }
  if (topic) {
    filters.push('topic = ?');
    values.push(topic);
  }

  const where = filters.join(' and ');
  const total = await queryFirst<{ total: number }>(
    db,
    `select count(*) as total from diary_entries where ${where}`,
    values,
  );
  const rows = await queryAll<DiaryEntryRecord>(
    db,
    `select id, tenant_id, agent_name, topic, wing, room, r2_key, content_hash, created_at, updated_at
       from diary_entries
      where ${where}
      order by created_at asc
      limit ? offset ?`,
    [...values, limit, offset],
  );

  const dryRun = input.dry_run === true;
  const scope = {
    entry_id: entryId ?? null,
    agent: agentName ?? null,
    wing: wing ?? null,
    room: room ?? null,
    topic: topic ?? null,
  };
  if (dryRun) {
    return {
      success: true,
      dry_run: true,
      scope,
      total: total?.total ?? 0,
      count: rows.length,
      reindexed: 0,
      failed: 0,
      results: rows.map((row) => ({
        entry_id: row.id,
        agent: row.agent_name,
        topic: row.topic,
        wing: row.wing,
        room: row.room,
        success: true,
        skipped: true,
        chunks: 0,
      })),
    };
  }

  const results: Array<{
    entry_id: string;
    agent: string;
    topic: string;
    wing: string;
    room: string;
    success: boolean;
    chunks: number;
    error?: string;
  }> = [];
  for (const row of rows) {
    try {
      const chunks = await reindexDiaryEntry(env, config, auth, row);
      results.push({ entry_id: row.id, agent: row.agent_name, topic: row.topic, wing: row.wing, room: row.room, success: true, chunks });
    } catch (error) {
      results.push({
        entry_id: row.id,
        agent: row.agent_name,
        topic: row.topic,
        wing: row.wing,
        room: row.room,
        success: false,
        chunks: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const failed = results.filter((item) => !item.success).length;
  const payload = {
    success: failed === 0,
    dry_run: false,
    scope,
    total: total?.total ?? 0,
    count: rows.length,
    reindexed: results.length - failed,
    failed,
    results,
  };
  await writeAuditLog(db, auth.tenantId, 'diary_reindex', { ...scope, limit, offset }, payload);
  return payload;
}

interface DiarySearchRow extends DiaryChunkRecord {
  agent_name: string;
  topic: string;
  wing: string;
  room: string;
  r2_key: string;
  entry_created_at: string;
  updated_at: string;
}

export async function diarySearch(env: AppEnv, config: AppConfig, auth: TenantAuthContext, input: DiarySearchInput) {
  const db = requireBinding(env.DB, 'DB');
  const bucket = requireBinding(env.MEMORY_BUCKET, 'MEMORY_BUCKET');
  const agentName = sanitizeSimpleText(input.agent_name.toLowerCase(), 'agent_name');
  const query = input.query.trim();
  if (!query) {
    throw new Error('query is required');
  }
  const limit = Math.min(Math.max(1, input.limit ?? config.searchDefaultLimit), config.searchMaxLimit);
  const candidateLimit = Math.min(config.searchMaxLimit, Math.max(limit * 5, limit + 20));
  const wing = input.wing ? sanitizeSimpleText(input.wing, 'wing') : undefined;
  const room = input.room ? sanitizeSimpleText(input.room, 'room') : undefined;
  const topic = input.topic ? sanitizeSimpleText(input.topic, 'topic', 120) : undefined;
  const vectorReservationDay = await reserveQuota(db, config, auth.tenantId, 'vector_queries', 1);
  const embeddingReservationDay = await reserveQuota(db, config, auth.tenantId, 'embedding_input_chars', query.length);

  let hits;
  try {
    const vector = await embedText(env, config, query);
    hits = await queryVectors(env, config, vector, {
      tenantId: auth.tenantId,
      topK: candidateLimit,
      kind: 'diary',
      agentName,
      ...(wing ? { wing } : {}),
      ...(room ? { room } : {}),
      ...(topic ? { topic } : {}),
    });
    if (input.max_distance !== undefined) {
      hits = hits.filter((hit) => (1 - hit.score) <= input.max_distance!);
    }
    await consumeQuotaReservation(db, auth.tenantId, 'vector_queries', 1, vectorReservationDay);
    await consumeQuotaReservation(db, auth.tenantId, 'embedding_input_chars', query.length, embeddingReservationDay);
  } catch (error) {
    await releaseQuotaReservation(db, auth.tenantId, 'vector_queries', 1, vectorReservationDay);
    await releaseQuotaReservation(db, auth.tenantId, 'embedding_input_chars', query.length, embeddingReservationDay);
    throw error;
  }

  const filters = { agent: agentName, wing: wing ?? null, room: room ?? null, topic: topic ?? null };
  if (hits.length === 0) {
    return { query, filters, results: [] as DiarySearchResultItem[], context_received: input.context ?? null };
  }

  const vectorIds = hits.map((hit) => hit.id);
  const rowFilters: string[] = [
    'c.tenant_id = ?',
    `c.vector_id in (${placeholders(vectorIds.length)})`,
    'e.agent_name = ?',
  ];
  const values: unknown[] = [auth.tenantId, ...vectorIds, agentName];
  if (wing) {
    rowFilters.push('e.wing = ?');
    values.push(wing);
  }
  if (room) {
    rowFilters.push('e.room = ?');
    values.push(room);
  }
  if (topic) {
    rowFilters.push('e.topic = ?');
    values.push(topic);
  }
  const rows = await queryAll<DiarySearchRow>(
    db,
    `select c.id, c.tenant_id, c.diary_id, c.chunk_index, c.vector_id, c.chunk_text, c.chunk_chars, c.created_at,
            e.agent_name, e.topic, e.wing, e.room, e.r2_key, e.created_at as entry_created_at, e.updated_at
       from diary_chunks c
       join diary_entries e on e.id = c.diary_id and e.tenant_id = c.tenant_id
      where ${rowFilters.join(' and ')}`,
    values,
  );
  const rowByVectorId = new Map(rows.map((row) => [row.vector_id, row]));
  const seenDiaryIds = new Set<string>();
  const results: DiarySearchResultItem[] = [];
  for (const hit of hits) {
    const row = rowByVectorId.get(hit.id);
    if (!row || seenDiaryIds.has(row.diary_id)) {
      continue;
    }
    seenDiaryIds.add(row.diary_id);
    const fullContent = (await getText(bucket, row.r2_key)) ?? row.chunk_text;
    results.push({
      entry_id: row.diary_id,
      agent: row.agent_name,
      topic: row.topic,
      wing: row.wing,
      room: row.room,
      timestamp: row.entry_created_at,
      similarity: hit.score,
      chunk_index: row.chunk_index,
      preview: previewText(fullContent, config.searchResultMaxChars),
    });
    if (results.length >= limit) {
      break;
    }
  }

  await incrementUsage(db, auth.tenantId, { memory_reads: results.length, r2_reads: results.length });
  return { query, filters, results, context_received: input.context ?? null };
}
