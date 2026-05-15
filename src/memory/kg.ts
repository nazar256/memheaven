import type { AppConfig, AppEnv } from '../config';
import type { KgEntityRecord, KgTripleRecord, TenantAuthContext } from './types';
import { writeAuditLog } from './audit';
import { consumeQuotaReservation, incrementUsage, releaseQuotaReservation, reserveQuota } from './quotas';
import { queryAll, queryFirst, execute } from '../storage/d1';
import { requireBinding } from './index';
import { deterministicId } from '../utils/ids';
import { asIsoDate, nowIso } from '../utils/time';
import { sanitizeSimpleText } from '../security/validators';

export interface KgAddInput {
  subject: string;
  predicate: string;
  object: string;
  valid_from?: string;
  valid_to?: string;
  confidence?: number;
  source_drawer_id?: string;
  source_closet?: string;
  source_file?: string;
}

export interface KgQueryInput {
  entity: string;
  as_of?: string;
  direction?: 'outgoing' | 'incoming' | 'both';
}

export interface KgInvalidateInput {
  subject: string;
  predicate: string;
  object: string;
  ended?: string;
}

export interface KgTimelineInput {
  entity?: string;
}

function normalizeEntity(value: string): string {
  return sanitizeSimpleText(value, 'entity', 200).toLowerCase();
}

async function upsertEntity(env: AppEnv, auth: TenantAuthContext, name: string) {
  const db = requireBinding(env.DB, 'DB');
  const normalized = normalizeEntity(name);
  const existing = await queryFirst<KgEntityRecord>(
    db,
    `select id, tenant_id, name, normalized_name, type, properties_json, created_at, updated_at
       from kg_entities
      where tenant_id = ? and normalized_name = ?`,
    [auth.tenantId, normalized],
  );
  if (existing) {
    return existing.id;
  }
  const createdAt = nowIso();
  const id = await deterministicId('kgent', [auth.tenantId, normalized]);
  await execute(
    db,
    `insert into kg_entities(id, tenant_id, name, normalized_name, type, properties_json, created_at, updated_at)
     values (?, ?, ?, ?, null, null, ?, ?)`,
    [id, auth.tenantId, sanitizeSimpleText(name, 'name', 200), normalized, createdAt, createdAt],
  );
  return id;
}

async function requireOwnedDrawerId(env: AppEnv, tenantId: string, drawerId: string | undefined): Promise<string | null> {
  if (!drawerId) {
    return null;
  }
  const db = requireBinding(env.DB, 'DB');
  const drawer = await queryFirst<{ id: string }>(
    db,
    `select id from drawers where tenant_id = ? and id = ? and deleted_at is null`,
    [tenantId, drawerId],
  );
  if (!drawer) {
    throw new Error('source_drawer_id must reference an existing drawer for this tenant');
  }
  return drawerId;
}

export async function kgAdd(env: AppEnv, config: AppConfig, auth: TenantAuthContext, input: KgAddInput) {
  const db = requireBinding(env.DB, 'DB');
  const reservationDay = await reserveQuota(db, config, auth.tenantId, 'memory_writes', 1);
  const subject = sanitizeSimpleText(input.subject, 'subject', 200);
  const predicate = sanitizeSimpleText(input.predicate, 'predicate', 120);
  const object = sanitizeSimpleText(input.object, 'object', 200);
  const validFrom = input.valid_from ? asIsoDate(input.valid_from) : null;
  const validTo = input.valid_to ? asIsoDate(input.valid_to) : null;
  try {
    if (validFrom && validTo && validFrom > validTo) {
      throw new Error('valid_to must not be earlier than valid_from');
    }
    const sourceDrawerId = await requireOwnedDrawerId(env, auth.tenantId, input.source_drawer_id);
    await upsertEntity(env, auth, subject);
    await upsertEntity(env, auth, object);

    const createdAt = nowIso();
    const tripleId = await deterministicId('kgtriple', [auth.tenantId, subject, predicate, object, validFrom, createdAt]);
    await execute(
      db,
      `insert into kg_triples(id, tenant_id, subject, predicate, object, valid_from, valid_to, confidence, source_drawer_id, source_closet, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tripleId,
        auth.tenantId,
        subject,
        predicate,
        object,
        validFrom,
        validTo,
        input.confidence ?? null,
        sourceDrawerId,
        input.source_closet ?? input.source_file ?? null,
        createdAt,
        createdAt,
      ],
    );
    await consumeQuotaReservation(db, auth.tenantId, 'memory_writes', 1, reservationDay);
    await writeAuditLog(db, auth.tenantId, 'kg_add', input, { success: true, triple_id: tripleId });
    return {
      success: true,
      triple_id: tripleId,
      fact: { subject, predicate, object, valid_from: validFrom, valid_to: validTo, confidence: input.confidence ?? null },
    };
  } catch (error) {
    await releaseQuotaReservation(db, auth.tenantId, 'memory_writes', 1, reservationDay);
    throw error;
  }
}

function currentFactWhere(asOf?: string): { clause: string; values: unknown[] } {
  if (!asOf) {
    return { clause: `(valid_to is null or valid_to > ?)` , values: [nowIso()] };
  }
  const normalized = asIsoDate(asOf);
  return {
    clause: `((valid_from is null or valid_from <= ?) and (valid_to is null or valid_to > ?))`,
    values: [normalized, normalized],
  };
}

export async function kgQuery(env: AppEnv, auth: TenantAuthContext, input: KgQueryInput) {
  const db = requireBinding(env.DB, 'DB');
  const entity = sanitizeSimpleText(input.entity, 'entity', 200);
  const direction = input.direction ?? 'both';
  const validity = currentFactWhere(input.as_of);
  const filters = ['tenant_id = ?', validity.clause];
  const values: unknown[] = [auth.tenantId, ...validity.values];
  if (direction === 'outgoing') {
    filters.push('subject = ?');
    values.push(entity);
  } else if (direction === 'incoming') {
    filters.push('object = ?');
    values.push(entity);
  } else {
    filters.push('(subject = ? or object = ?)');
    values.push(entity, entity);
  }
  const facts = await queryAll<KgTripleRecord>(
    db,
    `select id, tenant_id, subject, predicate, object, valid_from, valid_to, confidence, source_drawer_id, source_closet, created_at, updated_at
       from kg_triples
      where ${filters.join(' and ')}
      order by coalesce(valid_from, created_at) desc, created_at desc`,
    values,
  );
  return {
    entity,
    as_of: input.as_of ?? null,
    facts: facts.map((fact) => ({
      subject: fact.subject,
      predicate: fact.predicate,
      object: fact.object,
      valid_from: fact.valid_from,
      valid_to: fact.valid_to,
      confidence: fact.confidence,
      source_drawer_id: fact.source_drawer_id,
      source_closet: fact.source_closet,
    })),
    count: facts.length,
  };
}

export async function kgInvalidate(env: AppEnv, config: AppConfig, auth: TenantAuthContext, input: KgInvalidateInput) {
  const db = requireBinding(env.DB, 'DB');
  const reservationDay = await reserveQuota(db, config, auth.tenantId, 'memory_writes', 1);
  const subject = sanitizeSimpleText(input.subject, 'subject', 200);
  const predicate = sanitizeSimpleText(input.predicate, 'predicate', 120);
  const object = sanitizeSimpleText(input.object, 'object', 200);
  const ended = input.ended ? asIsoDate(input.ended) : nowIso();
  try {
    await execute(
      db,
      `update kg_triples
       set valid_to = ?, updated_at = ?
        where tenant_id = ? and subject = ? and predicate = ? and object = ? and (valid_to is null or valid_to > ?)`,
      [ended, nowIso(), auth.tenantId, subject, predicate, object, ended],
    );
    await consumeQuotaReservation(db, auth.tenantId, 'memory_writes', 1, reservationDay);
    await writeAuditLog(db, auth.tenantId, 'kg_invalidate', input, { success: true, ended });
    return { success: true, fact: { subject, predicate, object }, ended };
  } catch (error) {
    await releaseQuotaReservation(db, auth.tenantId, 'memory_writes', 1, reservationDay);
    throw error;
  }
}

export async function kgTimeline(env: AppEnv, auth: TenantAuthContext, input: KgTimelineInput) {
  const db = requireBinding(env.DB, 'DB');
  const values: unknown[] = [auth.tenantId];
  let where = 'tenant_id = ?';
  if (input.entity) {
    const entity = sanitizeSimpleText(input.entity, 'entity', 200);
    where += ' and (subject = ? or object = ?)';
    values.push(entity, entity);
  }
  const facts = await queryAll<KgTripleRecord>(
    db,
    `select id, tenant_id, subject, predicate, object, valid_from, valid_to, confidence, source_drawer_id, source_closet, created_at, updated_at
       from kg_triples
      where ${where}
      order by coalesce(valid_from, created_at) desc, created_at desc
      limit 100`,
    values,
  );
  return {
    entity: input.entity ?? 'all',
    timeline: facts.map((fact) => ({
      subject: fact.subject,
      predicate: fact.predicate,
      object: fact.object,
      valid_from: fact.valid_from,
      valid_to: fact.valid_to,
      created_at: fact.created_at,
      updated_at: fact.updated_at,
    })),
    count: facts.length,
  };
}

export async function kgStats(env: AppEnv, auth: TenantAuthContext) {
  const db = requireBinding(env.DB, 'DB');
  const entities = await queryFirst<{ total: number }>(db, `select count(*) as total from kg_entities where tenant_id = ?`, [auth.tenantId]);
  const triples = await queryFirst<{ total: number }>(db, `select count(*) as total from kg_triples where tenant_id = ?`, [auth.tenantId]);
  const currentFacts = await queryFirst<{ total: number }>(
    db,
    `select count(*) as total from kg_triples where tenant_id = ? and (valid_to is null or valid_to > ?)`,
    [auth.tenantId, nowIso()],
  );
  const expiredFacts = await queryFirst<{ total: number }>(
    db,
    `select count(*) as total from kg_triples where tenant_id = ? and valid_to is not null and valid_to <= ?`,
    [auth.tenantId, nowIso()],
  );
  const relationshipTypes = await queryAll<{ predicate: string; count: number }>(
    db,
    `select predicate, count(*) as count from kg_triples where tenant_id = ? group by predicate order by count desc`,
    [auth.tenantId],
  );
  return {
    entities: entities?.total ?? 0,
    triples: triples?.total ?? 0,
    current_facts: currentFacts?.total ?? 0,
    expired_facts: expiredFacts?.total ?? 0,
    relationship_types: Object.fromEntries(relationshipTypes.map((row) => [row.predicate, row.count])),
  };
}
