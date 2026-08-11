import type { AppConfig, AppEnv } from '../src/config';
import type { TenantAuthContext } from '../src/memory/types';
import { requireConfig } from '../src/config';
import { DeterministicAiBinding } from './adapters/ai-deterministic';
import { createSqlJsD1Database } from './adapters/d1-sqljs';
import { MemoryR2Bucket } from './adapters/r2-memory';
import { MemoryVectorizeIndex } from './adapters/vector-memory';

export const GLAMA_TENANT_ID = 'glama-inspection';
export const GLAMA_EMBEDDING_DIMENSIONS = 384;

const EPHEMERAL_SECRET = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY';

export const glamaAuth: TenantAuthContext = {
  tenantId: GLAMA_TENANT_ID,
  keyId: 'glama-inspection-key',
  keyLabel: 'Glama inspection',
  clientId: 'glama-inspection-client',
  scopes: ['memory.read', 'memory.write'],
  tokenType: 'access_token',
  subject: 'glama-inspection-subject',
};

export async function createGlamaEnv(): Promise<AppEnv> {
  const db = await createSqlJsD1Database();
  return {
    DB: db,
    MEMORY_BUCKET: new MemoryR2Bucket(),
    AI: new DeterministicAiBinding(GLAMA_EMBEDDING_DIMENSIONS),
    VECTORIZE: new MemoryVectorizeIndex(GLAMA_EMBEDDING_DIMENSIONS),
    OAUTH_ISSUER: 'https://glama.invalid',
    MCP_RESOURCE: 'https://glama.invalid/mcp',
    MCP_AUDIENCE: 'https://glama.invalid/mcp',
    EMBEDDING_MODEL: 'deterministic-local',
    EMBEDDING_DIMENSIONS: String(GLAMA_EMBEDDING_DIMENSIONS),
    VECTORIZE_INDEX_NAME: 'glama-in-memory',
    PLAN_MODE: 'paid',
    SEARCH_DEFAULT_LIMIT: '10',
    SEARCH_MAX_LIMIT: '100',
    DRAWER_MAX_CHARS: '64000',
    DRAWER_DEFAULT_MAX_CHARS: '16000',
    SEARCH_RESULT_MAX_CHARS: '4000',
    DAILY_MAX_MCP_CALLS_PER_TENANT: '1000000',
    DAILY_MAX_WRITES_PER_TENANT: '1000000',
    DAILY_MAX_VECTOR_QUERIES_PER_TENANT: '1000000',
    DAILY_MAX_EMBEDDING_INPUT_CHARS_PER_TENANT: '100000000',
    JWT_SIGNING_SECRET: EPHEMERAL_SECRET,
    TOKEN_ENCRYPTION_KEY: EPHEMERAL_SECRET,
    AUTH_KEY_PEPPER: EPHEMERAL_SECRET,
    ACCESS_KEYS_JSON: JSON.stringify([{
      id: glamaAuth.keyId,
      tenant_id: GLAMA_TENANT_ID,
      label: glamaAuth.keyLabel,
      hash: 'glama-inspection-hash-not-used-by-stdio',
      scopes: glamaAuth.scopes,
      active: true,
    }]),
  };
}

export function glamaConfig(env: AppEnv): AppConfig {
  const config = requireConfig(env);
  return {
    ...config,
    backendCapabilities: {
      ...config.backendCapabilities,
      deployment: 'glama-inspection',
      content_store: 'ephemeral in-memory object store',
      vector_backend: 'ephemeral in-memory cosine index',
      embedding_model: 'deterministic-local',
      ephemeral: true,
    },
  };
}

export async function createGlamaRuntime(): Promise<{ env: AppEnv; config: AppConfig; auth: TenantAuthContext }> {
  const env = await createGlamaEnv();
  return { env, config: glamaConfig(env), auth: glamaAuth };
}
