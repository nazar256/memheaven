import type { AppEnv, AppConfig, VectorizeVector, VectorizeMatch } from '../config';

export interface VectorMetadata extends Record<string, unknown> {
  tenant_id: string;
  drawer_id?: string;
  diary_id?: string;
  chunk_index: number;
  wing?: string;
  room?: string;
  kind: 'drawer' | 'diary' | 'kg_source';
  created_at: string;
}

export interface QueryVectorOptions {
  tenantId: string;
  topK: number;
  wing?: string;
  room?: string;
  kind?: VectorMetadata['kind'];
}

export async function describeVectorIndex(env: AppEnv) {
  if (!env.VECTORIZE) {
    throw new Error('Vectorize binding is unavailable');
  }
  return env.VECTORIZE.describe();
}

export async function upsertVectors(env: AppEnv, tenantId: string, vectors: VectorizeVector[]): Promise<void> {
  if (!env.VECTORIZE) {
    throw new Error('Vectorize binding is unavailable');
  }
  await env.VECTORIZE.upsert(
    vectors.map((vector) => ({
      ...vector,
      namespace: tenantNamespace(tenantId),
    })),
  );
}

export async function deleteVectors(env: AppEnv, ids: string[]): Promise<void> {
  if (!env.VECTORIZE) {
    throw new Error('Vectorize binding is unavailable');
  }
  if (ids.length === 0) {
    return;
  }
  const existing = await env.VECTORIZE.getByIds(ids);
  const unknownNamespaceVectors = existing.filter((vector) => typeof vector.namespace !== 'string');
  if (unknownNamespaceVectors.length > 0) {
    throw new Error('Vectorize delete safety check failed because one or more vectors had no namespace');
  }
  const namespaces = new Set(existing.map((vector) => vector.namespace));
  if (namespaces.size > 1) {
    throw new Error('Vectorize delete safety check failed because vectors spanned multiple namespaces');
  }
  await env.VECTORIZE.deleteByIds(ids);
}

export async function queryVectors(
  env: AppEnv,
  _config: AppConfig,
  vector: number[],
  options: QueryVectorOptions,
): Promise<VectorizeMatch[]> {
  if (!env.VECTORIZE) {
    throw new Error('Vectorize binding is unavailable');
  }

  const filter: Record<string, unknown> = { tenant_id: options.tenantId };
  if (options.wing) {
    filter.wing = options.wing;
  }
  if (options.room) {
    filter.room = options.room;
  }
  if (options.kind) {
    filter.kind = options.kind;
  }

  const response = await env.VECTORIZE.query(vector, {
    topK: options.topK,
    namespace: tenantNamespace(options.tenantId),
    returnMetadata: 'all',
    filter,
  });
  return response.matches;
}

export function tenantNamespace(tenantId: string): string {
  return `tenant_${tenantId}`.slice(0, 64);
}
