import { z } from 'zod';

import type { AccessKeyRecord, BackendCapabilities, BindingStatus, HealthWarning, PlanMode } from './memory/types';
import { decodeBase64Flexible } from './utils/ids';
import { parseJsonObject } from './utils/json';

export interface StatementResult<T = Record<string, unknown>> {
  success: boolean;
  results?: T[];
  error?: string;
  meta?: Record<string, unknown>;
}

export interface StatementRunResult {
  success: boolean;
  meta?: Record<string, unknown>;
  error?: string;
}

export interface PreparedStatementLike {
  bind(...values: unknown[]): PreparedStatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<StatementResult<T>>;
  run(): Promise<StatementRunResult>;
}

export interface D1DatabaseLike {
  prepare(query: string): PreparedStatementLike;
  batch<T = unknown>(statements: PreparedStatementLike[]): Promise<T[]>;
}

export interface R2ObjectBodyLike {
  text(): Promise<string>;
}

export interface R2ObjectLike {
  body: R2ObjectBodyLike | null;
  text(): Promise<string>;
  etag?: string;
}

export interface R2BucketLike {
  get(key: string): Promise<R2ObjectLike | null>;
  put(key: string, value: string, options?: { httpMetadata?: Record<string, string> }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface AiBindingLike {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}

export interface VectorizeVector {
  id: string;
  values: number[] | Float32Array | Float64Array;
  namespace?: string;
  metadata?: Record<string, unknown>;
}

export interface VectorizeMatch {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
  values?: number[];
  namespace?: string;
}

export interface VectorizeMatches {
  count: number;
  matches: VectorizeMatch[];
}

export interface VectorizeMutation {
  mutationId: string;
}

export interface VectorizeIndexInfo {
  dimensions: number;
  vectorCount?: number;
  processedUpToDatetime?: number;
  processedUpToMutation?: number;
}

export interface VectorizeIndexLike {
  describe(): Promise<VectorizeIndexInfo>;
  query(vector: number[] | Float32Array | Float64Array, options?: Record<string, unknown>): Promise<VectorizeMatches>;
  upsert(vectors: VectorizeVector[]): Promise<VectorizeMutation>;
  deleteByIds(ids: string[]): Promise<VectorizeMutation>;
  getByIds(ids: string[]): Promise<VectorizeVector[]>;
}

export interface AppEnv {
  DB?: D1DatabaseLike;
  MEMORY_BUCKET?: R2BucketLike;
  AI?: AiBindingLike;
  VECTORIZE?: VectorizeIndexLike;
  JWT_SIGNING_SECRET?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  AUTH_KEY_PEPPER?: string;
  ACCESS_KEYS_JSON?: string;
  OAUTH_ISSUER?: string;
  MCP_RESOURCE?: string;
  MCP_AUDIENCE?: string;
  EMBEDDING_MODEL?: string;
  EMBEDDING_DIMENSIONS?: string;
  VECTORIZE_INDEX_NAME?: string;
  PLAN_MODE?: string;
  SEARCH_DEFAULT_LIMIT?: string;
  SEARCH_MAX_LIMIT?: string;
  DRAWER_MAX_CHARS?: string;
  DRAWER_DEFAULT_MAX_CHARS?: string;
  SEARCH_RESULT_MAX_CHARS?: string;
  DAILY_MAX_MCP_CALLS_PER_TENANT?: string;
  DAILY_MAX_WRITES_PER_TENANT?: string;
  DAILY_MAX_VECTOR_QUERIES_PER_TENANT?: string;
  DAILY_MAX_EMBEDDING_INPUT_CHARS_PER_TENANT?: string;
}

export interface AppConfig {
  issuer: string;
  mcpResource: string;
  mcpAudience: string;
  embeddingModel: string;
  embeddingDimensions: number;
  vectorizeIndexName: string;
  planMode: PlanMode;
  searchDefaultLimit: number;
  searchMaxLimit: number;
  drawerMaxChars: number;
  drawerDefaultMaxChars: number;
  searchResultMaxChars: number;
  dailyMaxMcpCallsPerTenant: number;
  dailyMaxWritesPerTenant: number;
  dailyMaxVectorQueriesPerTenant: number;
  dailyMaxEmbeddingInputCharsPerTenant: number;
  jwtSigningSecret: string;
  jwtSigningKeyBytes: Uint8Array;
  tokenEncryptionKey: string;
  tokenEncryptionKeyBytes: Uint8Array;
  authKeyPepper: string;
  authKeyPepperBytes: Uint8Array;
  accessKeys: AccessKeyRecord[];
  authCodeTtlSeconds: number;
  accessTokenTtlSeconds: number;
  refreshTokenMaxDays: number;
  authFlowRateLimitPerMinute: number;
  authFlowRateLimitWindowSeconds: number;
  csrfCookieName: string;
  supportedScopes: string[];
  backendCapabilities: BackendCapabilities;
}

export interface ConfigDiagnostics {
  ok: boolean;
  config?: AppConfig;
  errors: string[];
  warnings: HealthWarning[];
  bindingStatus: BindingStatus;
}

const envStringSchema = z.object({
  OAUTH_ISSUER: z.string().url(),
  MCP_RESOURCE: z.string().url(),
  MCP_AUDIENCE: z.string().url(),
  EMBEDDING_MODEL: z.string().min(1),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive(),
  VECTORIZE_INDEX_NAME: z.string().min(1),
  PLAN_MODE: z.enum(['free', 'paid']),
  SEARCH_DEFAULT_LIMIT: z.coerce.number().int().min(1).max(100),
  SEARCH_MAX_LIMIT: z.coerce.number().int().min(1).max(100),
  DRAWER_MAX_CHARS: z.coerce.number().int().min(1).max(1_000_000),
  DRAWER_DEFAULT_MAX_CHARS: z.coerce.number().int().min(1).max(1_000_000),
  SEARCH_RESULT_MAX_CHARS: z.coerce.number().int().min(1).max(100_000),
  DAILY_MAX_MCP_CALLS_PER_TENANT: z.coerce.number().int().min(1),
  DAILY_MAX_WRITES_PER_TENANT: z.coerce.number().int().min(1),
  DAILY_MAX_VECTOR_QUERIES_PER_TENANT: z.coerce.number().int().min(1),
  DAILY_MAX_EMBEDDING_INPUT_CHARS_PER_TENANT: z.coerce.number().int().min(1),
  JWT_SIGNING_SECRET: z.string().min(1),
  TOKEN_ENCRYPTION_KEY: z.string().min(1),
  AUTH_KEY_PEPPER: z.string().min(1),
  ACCESS_KEYS_JSON: z.string().min(2),
});

const accessKeySchema = z.object({
  id: z.string().min(1),
  tenant_id: z.string().min(1),
  label: z.string().min(1),
  hash: z.string().min(1),
  scopes: z.array(z.string().min(1)).default(['memory.read', 'memory.write']),
  active: z.boolean(),
});

export function getBindingStatus(env: AppEnv): BindingStatus {
  return {
    db: Boolean(env.DB),
    r2: Boolean(env.MEMORY_BUCKET),
    ai: Boolean(env.AI),
    vectorize: Boolean(env.VECTORIZE),
  };
}

export function getConfigDiagnostics(env: AppEnv): ConfigDiagnostics {
  const bindingStatus = getBindingStatus(env);
  const warnings: HealthWarning[] = [];
  const envResult = envStringSchema.safeParse(env);
  const errors = envResult.success
    ? []
    : envResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);

  if (envResult.success && envResult.data.SEARCH_DEFAULT_LIMIT > envResult.data.SEARCH_MAX_LIMIT) {
    errors.push('SEARCH_DEFAULT_LIMIT must not exceed SEARCH_MAX_LIMIT');
  }

  if (envResult.success && envResult.data.DRAWER_DEFAULT_MAX_CHARS > envResult.data.DRAWER_MAX_CHARS) {
    errors.push('DRAWER_DEFAULT_MAX_CHARS must not exceed DRAWER_MAX_CHARS');
  }

  if (!bindingStatus.db) {
    warnings.push({ code: 'missing_db', message: 'D1 binding DB is missing' });
  }
  if (!bindingStatus.r2) {
    warnings.push({ code: 'missing_r2', message: 'R2 binding MEMORY_BUCKET is missing' });
  }
  if (!bindingStatus.ai) {
    warnings.push({ code: 'missing_ai', message: 'Workers AI binding AI is missing' });
  }
  if (!bindingStatus.vectorize) {
    warnings.push({ code: 'missing_vectorize', message: 'Vectorize binding VECTORIZE is missing' });
  }

  if (!envResult.success) {
    return { ok: false, errors, warnings, bindingStatus };
  }

  try {
    const accessKeys = z.array(accessKeySchema).parse(parseJsonObject<unknown>(envResult.data.ACCESS_KEYS_JSON, 'ACCESS_KEYS_JSON'));
    const jwtSigningKeyBytes = decodeBase64Flexible(envResult.data.JWT_SIGNING_SECRET);
    const tokenEncryptionKeyBytes = decodeBase64Flexible(envResult.data.TOKEN_ENCRYPTION_KEY);
    const authKeyPepperBytes = decodeBase64Flexible(envResult.data.AUTH_KEY_PEPPER);

    if (jwtSigningKeyBytes.length < 32) {
      errors.push('JWT_SIGNING_SECRET must decode to at least 32 bytes');
    }
    if (![16, 24, 32].includes(tokenEncryptionKeyBytes.length)) {
      errors.push('TOKEN_ENCRYPTION_KEY must decode to 16, 24, or 32 bytes');
    }
    if (authKeyPepperBytes.length < 32) {
      errors.push('AUTH_KEY_PEPPER must decode to at least 32 bytes');
    }
    const duplicateIds = duplicateValues(accessKeys.map((record) => record.id));
    if (duplicateIds.length > 0) {
      errors.push(`ACCESS_KEYS_JSON contains duplicate key ids: ${duplicateIds.join(', ')}`);
    }
    const duplicateHashes = duplicateValues(accessKeys.map((record) => record.hash));
    if (duplicateHashes.length > 0) {
      errors.push('ACCESS_KEYS_JSON contains duplicate key hashes');
    }
    if (!accessKeys.some((record) => record.active)) {
      warnings.push({ code: 'no_active_access_keys', message: 'No active access keys are configured' });
    }

    if (errors.length > 0) {
      return { ok: false, errors, warnings, bindingStatus };
    }

    const config: AppConfig = {
      issuer: envResult.data.OAUTH_ISSUER,
      mcpResource: envResult.data.MCP_RESOURCE,
      mcpAudience: envResult.data.MCP_AUDIENCE,
      embeddingModel: envResult.data.EMBEDDING_MODEL,
      embeddingDimensions: envResult.data.EMBEDDING_DIMENSIONS,
      vectorizeIndexName: envResult.data.VECTORIZE_INDEX_NAME,
      planMode: envResult.data.PLAN_MODE as PlanMode,
      searchDefaultLimit: envResult.data.SEARCH_DEFAULT_LIMIT,
      searchMaxLimit: envResult.data.SEARCH_MAX_LIMIT,
      drawerMaxChars: envResult.data.DRAWER_MAX_CHARS,
      drawerDefaultMaxChars: envResult.data.DRAWER_DEFAULT_MAX_CHARS,
      searchResultMaxChars: envResult.data.SEARCH_RESULT_MAX_CHARS,
      dailyMaxMcpCallsPerTenant: envResult.data.DAILY_MAX_MCP_CALLS_PER_TENANT,
      dailyMaxWritesPerTenant: envResult.data.DAILY_MAX_WRITES_PER_TENANT,
      dailyMaxVectorQueriesPerTenant: envResult.data.DAILY_MAX_VECTOR_QUERIES_PER_TENANT,
      dailyMaxEmbeddingInputCharsPerTenant: envResult.data.DAILY_MAX_EMBEDDING_INPUT_CHARS_PER_TENANT,
      jwtSigningSecret: envResult.data.JWT_SIGNING_SECRET,
      jwtSigningKeyBytes,
      tokenEncryptionKey: envResult.data.TOKEN_ENCRYPTION_KEY,
      tokenEncryptionKeyBytes,
      authKeyPepper: envResult.data.AUTH_KEY_PEPPER,
      authKeyPepperBytes,
      accessKeys,
      authCodeTtlSeconds: 180,
      accessTokenTtlSeconds: 3600,
      refreshTokenMaxDays: 365,
      authFlowRateLimitPerMinute: 3,
      authFlowRateLimitWindowSeconds: 60,
      csrfCookieName: 'memheaven_csrf',
      supportedScopes: ['memory.read', 'memory.write'],
      backendCapabilities: {
        deployment: 'cloudflare-worker',
        content_store: 'R2 durable content store',
        vector_backend: 'Vectorize',
        embedding_model: envResult.data.EMBEDDING_MODEL,
        embedding_dimensions: envResult.data.EMBEDDING_DIMENSIONS,
        chunking_enabled: true,
        ephemeral: false,
        plan_mode: envResult.data.PLAN_MODE as PlanMode,
        limits: {
          search_default_limit: envResult.data.SEARCH_DEFAULT_LIMIT,
          search_max_limit: envResult.data.SEARCH_MAX_LIMIT,
          drawer_default_max_chars: envResult.data.DRAWER_DEFAULT_MAX_CHARS,
          drawer_max_chars: envResult.data.DRAWER_MAX_CHARS,
          search_result_max_chars: envResult.data.SEARCH_RESULT_MAX_CHARS,
        },
      },
    };

    return { ok: true, config, errors: [], warnings, bindingStatus };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    return { ok: false, errors, warnings, bindingStatus };
  }
}

export function requireConfig(env: AppEnv): AppConfig {
  const diagnostics = getConfigDiagnostics(env);
  if (!diagnostics.ok || !diagnostics.config) {
    throw new Error(`Invalid configuration: ${diagnostics.errors.join('; ')}`);
  }
  return diagnostics.config;
}

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }
    seen.add(value);
  }
  return [...duplicates].sort();
}
