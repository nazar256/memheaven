export type PlanMode = 'free' | 'paid';

export interface AccessKeyRecord {
  id: string;
  tenant_id: string;
  label: string;
  hash: string;
  scopes: string[];
  active: boolean;
}

export interface TenantAuthContext {
  tenantId: string;
  keyId: string;
  keyLabel: string;
  clientId: string;
  scopes: string[];
  tokenType: 'access_token';
  subject: string;
}

export interface DrawerRecord {
  id: string;
  tenant_id: string;
  wing: string;
  room: string;
  hall: string | null;
  title: string | null;
  source_file: string | null;
  added_by: string | null;
  content_hash: string;
  r2_key: string;
  content_chars: number;
  token_estimate: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DrawerChunkRecord {
  id: string;
  tenant_id: string;
  drawer_id: string;
  chunk_index: number;
  vector_id: string;
  chunk_text: string;
  chunk_chars: number;
  created_at: string;
}

export interface DiaryEntryRecord {
  id: string;
  tenant_id: string;
  agent_name: string;
  topic: string;
  r2_key: string;
  content_hash: string;
  created_at: string;
}

export interface KgEntityRecord {
  id: string;
  tenant_id: string;
  name: string;
  normalized_name: string;
  type: string | null;
  properties_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface KgTripleRecord {
  id: string;
  tenant_id: string;
  subject: string;
  predicate: string;
  object: string;
  valid_from: string | null;
  valid_to: string | null;
  confidence: number | null;
  source_drawer_id: string | null;
  source_closet: string | null;
  created_at: string;
  updated_at: string;
}

export interface TunnelRecord {
  id: string;
  tenant_id: string;
  source_wing: string;
  source_room: string;
  target_wing: string;
  target_room: string;
  label: string | null;
  source_drawer_id: string | null;
  target_drawer_id: string | null;
  created_at: string;
}

export interface UsageCounterRecord {
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

export interface WriteAuditLogRecord {
  id: string;
  tenant_id: string;
  operation: string;
  redacted_params_json: string;
  result_json: string | null;
  created_at: string;
}

export interface ChunkedText {
  chunkIndex: number;
  text: string;
  charCount: number;
}

export interface SearchResultItem {
  drawer_id: string;
  text: string;
  wing: string;
  room: string;
  source_file: string | null;
  similarity: number;
  chunk_index: number;
  created_at: string;
  updated_at: string;
}

export interface DuplicateMatch {
  id: string;
  wing: string;
  room: string;
  similarity: number;
  content: string;
}

export interface QuotaSnapshot extends UsageCounterRecord {
  limits: {
    mcp_calls: number;
    memory_writes: number;
    vector_queries: number;
    embedding_input_chars: number;
  };
}

export interface HealthWarning {
  code: string;
  message: string;
}

export interface BindingStatus {
  db: boolean;
  r2: boolean;
  ai: boolean;
  vectorize: boolean;
}

export interface BackendCapabilities {
  vector_backend: string;
  embedding_model: string;
  embedding_dimensions: number;
  chunking_enabled: boolean;
  plan_mode: PlanMode;
  limits: {
    search_default_limit: number;
    search_max_limit: number;
    drawer_default_max_chars: number;
    drawer_max_chars: number;
    search_result_max_chars: number;
  };
}
