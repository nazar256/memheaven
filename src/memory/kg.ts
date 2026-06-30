import type { AppConfig, AppEnv } from '../config';
import type { KgEntityRecord, KgTripleRecord, TenantAuthContext } from './types';
import { writeAuditLog } from './audit';
import { consumeQuotaReservation, releaseQuotaReservation, reserveQuota } from './quotas';
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

export interface KgCheckInput {
  entity?: string;
  predicate?: string;
  as_of?: string;
  older_than_days?: number;
  predicates?: string[];
  single_valued_predicates?: string[];
  include_source_checks?: boolean;
  limit?: number;
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_SINGLE_VALUED_PREDICATES = [
  'active_project',
  'assigned_to',
  'blocked_by',
  'current_role',
  'default_database',
  'is_status',
  'lives_in',
  'reports_to',
  'status',
  'works_at',
];
const DEFAULT_STALE_PREDICATES = [
  'active_project',
  'assigned_to',
  'blocked_by',
  'current_role',
  'depends_on',
  'is_status',
  'status',
  'works_on',
];

function temporalStartKey(value: string): number {
  if (DATE_ONLY_RE.test(value)) {
    return Date.parse(`${value}T00:00:00.000Z`);
  }
  return Date.parse(value);
}

function temporalEndKey(value: string): number {
  if (DATE_ONLY_RE.test(value)) {
    return Date.parse(`${value}T23:59:59.999Z`);
  }
  return Date.parse(value);
}

function assertTemporalInterval(validFrom: string | null, validTo: string | null, endLabel: 'valid_to' | 'ended'): void {
  if (!validFrom || !validTo) {
    return;
  }
  if (temporalEndKey(validTo) < temporalStartKey(validFrom)) {
    throw new Error(`${endLabel} must not be earlier than valid_from (${validTo} < ${validFrom})`);
  }
}

function shouldInvalidateAt(validTo: string | null, ended: string): boolean {
  return validTo === null || temporalEndKey(validTo) > temporalEndKey(ended);
}

// D1/SQLite cannot add a CHECK constraint to existing kg_triples rows without a table rebuild,
// and trigger date-only semantics would need to mirror this app helper exactly. Keep interval
// integrity in the write paths for now and cover the behavior with regression tests.

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
    assertTemporalInterval(validFrom, validTo, 'valid_to');
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
  const normalized = asOf ? asIsoDate(asOf) : nowIso();
  return {
    clause: `((valid_from is null or valid_from <= ?) and (valid_to is null or valid_to > ?))`,
    values: [normalized, normalized],
  };
}

function normalizePredicateList(values: string[] | undefined, fallback: string[]): Set<string> {
  return new Set((values?.length ? values : fallback).map((value) => sanitizeSimpleText(value, 'predicate', 120)));
}

function ageDays(fact: KgTripleRecord, asOf: string): number | null {
  const start = Date.parse(fact.valid_from ?? fact.created_at);
  const end = Date.parse(asOf);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

function factEvidence(fact: KgTripleRecord) {
  return {
    triple_id: fact.id,
    subject: fact.subject,
    predicate: fact.predicate,
    object: fact.object,
    valid_from: fact.valid_from,
    valid_to: fact.valid_to,
    confidence: fact.confidence,
    source_drawer_id: fact.source_drawer_id,
    source_closet: fact.source_closet,
    created_at: fact.created_at,
    updated_at: fact.updated_at,
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
    const targets = await queryAll<KgTripleRecord>(
      db,
      `select id, tenant_id, subject, predicate, object, valid_from, valid_to, confidence, source_drawer_id, source_closet, created_at, updated_at
         from kg_triples
        where tenant_id = ? and subject = ? and predicate = ? and object = ?`,
      [auth.tenantId, subject, predicate, object],
    );
    const activeTargets = targets.filter((target) => shouldInvalidateAt(target.valid_to, ended));
    for (const target of activeTargets) {
      assertTemporalInterval(target.valid_from, ended, 'ended');
    }

    const updatedAt = nowIso();
    for (const target of activeTargets) {
      await execute(db, `update kg_triples set valid_to = ?, updated_at = ? where tenant_id = ? and id = ?`, [ended, updatedAt, auth.tenantId, target.id]);
    }
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

export async function kgCheck(env: AppEnv, auth: TenantAuthContext, input: KgCheckInput) {
  const db = requireBinding(env.DB, 'DB');
  const asOf = input.as_of ? asIsoDate(input.as_of) : nowIso();
  const limit = Math.min(Math.max(1, input.limit ?? 50), 200);
  const validity = currentFactWhere(asOf);
  const filters = ['tenant_id = ?', validity.clause];
  const values: unknown[] = [auth.tenantId, ...validity.values];
  const entity = input.entity ? sanitizeSimpleText(input.entity, 'entity', 200) : null;
  const predicate = input.predicate ? sanitizeSimpleText(input.predicate, 'predicate', 120) : null;
  if (entity) {
    filters.push('(subject = ? or object = ?)');
    values.push(entity, entity);
  }
  if (predicate) {
    filters.push('predicate = ?');
    values.push(predicate);
  }

  const activeFacts = await queryAll<KgTripleRecord>(
    db,
    `select id, tenant_id, subject, predicate, object, valid_from, valid_to, confidence, source_drawer_id, source_closet, created_at, updated_at
       from kg_triples
      where ${filters.join(' and ')}
      order by subject asc, predicate asc, object asc, coalesce(valid_from, created_at) desc`,
    values,
  );

  const singleValuedPredicates = normalizePredicateList(input.single_valued_predicates, DEFAULT_SINGLE_VALUED_PREDICATES);
  const grouped = new Map<string, KgTripleRecord[]>();
  for (const fact of activeFacts) {
    if (!singleValuedPredicates.has(fact.predicate)) {
      continue;
    }
    const key = `${fact.subject}\u0000${fact.predicate}`;
    grouped.set(key, [...(grouped.get(key) ?? []), fact]);
  }
  const conflicts = [...grouped.values()]
    .filter((facts) => new Set(facts.map((fact) => fact.object)).size > 1)
    .map((facts) => ({
      code: 'active_conflict',
      severity: 'warning',
      subject: facts[0]!.subject,
      predicate: facts[0]!.predicate,
      objects: [...new Set(facts.map((fact) => fact.object))],
      facts: facts.map(factEvidence),
      suggested_action: 'Inspect mempalace_kg_timeline, then invalidate superseded facts if appropriate.',
    }))
    .slice(0, limit);

  const stalePredicates = normalizePredicateList(input.predicates, DEFAULT_STALE_PREDICATES);
  const staleFacts = activeFacts
    .filter((fact) => stalePredicates.has(fact.predicate))
    .map((fact) => ({ fact, age_days: ageDays(fact, asOf) }))
    .filter((item): item is { fact: KgTripleRecord; age_days: number } => item.age_days !== null && item.age_days >= (input.older_than_days ?? 90))
    .map((item) => ({
      code: 'stale_fact',
      severity: 'notice',
      age_days: item.age_days,
      older_than_days: input.older_than_days ?? 90,
      fact: factEvidence(item.fact),
      suggested_action: 'Verify the current state before relying on this fact.',
    }))
    .slice(0, limit);

  const sourceWarnings = input.include_source_checks === false ? [] : (await sourceLinkWarnings(db, auth.tenantId, activeFacts)).slice(0, limit);

  return {
    as_of: asOf,
    scope: { entity, predicate },
    summary: {
      active_conflicts: conflicts.length,
      stale_facts: staleFacts.length,
      source_warnings: sourceWarnings.length,
    },
    conflicts,
    stale_facts: staleFacts,
    source_warnings: sourceWarnings,
    guidance: [
      'This is deterministic KG reliability checking, not broad contradiction detection.',
      'Use mempalace_kg_timeline before deciding which fact to invalidate.',
      'Checks never mutate KG facts.',
    ],
  };
}

async function sourceLinkWarnings(db: NonNullable<AppEnv['DB']>, tenantId: string, facts: KgTripleRecord[]) {
  const warnings = [];
  const factsWithSource = facts.filter((fact) => fact.source_drawer_id);
  for (const fact of factsWithSource) {
    const drawer = await queryFirst<{ id: string; deleted_at: string | null; updated_at: string }>(
      db,
      `select id, tenant_id, wing, room, hall, title, source_file, added_by, content_hash, r2_key, content_chars, token_estimate, created_at, updated_at, deleted_at
         from drawers
        where tenant_id = ? and id = ?`,
      [tenantId, fact.source_drawer_id],
    );
    if (!drawer) {
      warnings.push({
        code: 'source_missing',
        severity: 'warning',
        source_drawer_id: fact.source_drawer_id,
        fact: factEvidence(fact),
        message: 'Source drawer is missing for this tenant.',
      });
      continue;
    }
    if (drawer.deleted_at) {
      warnings.push({
        code: 'source_deleted',
        severity: 'warning',
        source_drawer_id: fact.source_drawer_id,
        fact: factEvidence(fact),
        message: 'Source drawer was deleted after this KG fact was linked.',
      });
    }
    if (Date.parse(drawer.updated_at) > Date.parse(fact.updated_at || fact.created_at)) {
      warnings.push({
        code: 'source_updated_after_fact',
        severity: 'notice',
        source_drawer_id: fact.source_drawer_id,
        source_updated_at: drawer.updated_at,
        fact: factEvidence(fact),
        message: 'Source drawer changed after this KG fact was recorded.',
      });
    }
  }
  return warnings;
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
