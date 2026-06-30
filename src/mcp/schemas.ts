import { z } from 'zod';

const nullableString = z.string().nullable();
const nonNegativeInt = z.number().int().nonnegative();
const countMapSchema = z.record(z.string(), nonNegativeInt);
const taxonomySchema = z.record(z.string(), countMapSchema);

const duplicateMatchSchema = z.object({
  id: z.string(),
  wing: z.string(),
  room: z.string(),
  similarity: z.number(),
  content: z.string(),
});

const searchResultItemSchema = z.object({
  drawer_id: z.string(),
  text: z.string(),
  wing: z.string(),
  room: z.string(),
  source_file: nullableString,
  similarity: z.number(),
  chunk_index: nonNegativeInt,
  created_at: z.string(),
  updated_at: z.string(),
});

const drawerSummaryItemSchema = z.object({
  drawer_id: z.string(),
  wing: z.string(),
  room: z.string(),
  title: nullableString,
  source_file: nullableString,
  created_at: z.string(),
  updated_at: z.string(),
  content_chars: nonNegativeInt,
});

const wakeContextItemSchema = z.object({
  drawer_id: z.string(),
  wing: z.string(),
  room: z.string(),
  title: nullableString,
  source_file: nullableString,
  text: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  content_chars: nonNegativeInt,
  truncated: z.boolean(),
});

const diaryEntrySchema = z.object({
  date: z.string(),
  timestamp: z.string(),
  topic: z.string(),
  wing: z.string(),
  room: z.string(),
  content: z.string(),
});

const diarySearchResultItemSchema = z.object({
  entry_id: z.string(),
  agent: z.string(),
  topic: z.string(),
  wing: z.string(),
  room: z.string(),
  timestamp: z.string(),
  similarity: z.number(),
  chunk_index: nonNegativeInt,
  preview: z.string(),
});

const kgFactSchema = z.object({
  subject: z.string(),
  predicate: z.string(),
  object: z.string(),
  valid_from: nullableString,
  valid_to: nullableString,
  confidence: z.number().nullable(),
  source_drawer_id: nullableString,
  source_closet: nullableString,
});

const kgTimelineItemSchema = z.object({
  subject: z.string(),
  predicate: z.string(),
  object: z.string(),
  valid_from: nullableString,
  valid_to: nullableString,
  created_at: z.string(),
  updated_at: z.string(),
});

const roomGroupSchema = z.object({
  room: z.string(),
  wings: z.array(z.string()),
  halls: z.array(z.string()),
  count: nonNegativeInt,
  recent: z.string(),
});

const traverseResultSchema = z.object({
  room: z.string(),
  wings: z.array(z.string()),
  halls: z.array(z.string()),
  count: nonNegativeInt,
  hop: nonNegativeInt,
});

const tunnelRecordSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  source_wing: z.string(),
  source_room: z.string(),
  target_wing: z.string(),
  target_room: z.string(),
  label: nullableString,
  source_drawer_id: nullableString,
  target_drawer_id: nullableString,
  created_at: z.string(),
});

const followTunnelItemSchema = z.object({
  direction: z.enum(['incoming', 'outgoing']),
  connected_wing: z.string(),
  connected_room: z.string(),
  label: nullableString,
  drawer_id: nullableString,
  tunnel_id: z.string(),
  drawer_preview: nullableString,
});

const quotaSnapshotSchema = z.object({
  tenant_id: z.string(),
  day: z.string(),
  mcp_calls: nonNegativeInt,
  memory_reads: nonNegativeInt,
  memory_writes: nonNegativeInt,
  vector_queries: nonNegativeInt,
  embedding_input_chars: nonNegativeInt,
  r2_reads: nonNegativeInt,
  r2_writes: nonNegativeInt,
  limits: z.object({
    mcp_calls: nonNegativeInt,
    memory_writes: nonNegativeInt,
    vector_queries: nonNegativeInt,
    embedding_input_chars: nonNegativeInt,
  }),
});

const backendCapabilitiesSchema = z.object({
  vector_backend: z.string(),
  embedding_model: z.string(),
  embedding_dimensions: z.number().int().positive(),
  chunking_enabled: z.boolean(),
  plan_mode: z.enum(['free', 'paid']),
  limits: z.object({
    search_default_limit: nonNegativeInt,
    search_max_limit: nonNegativeInt,
    drawer_default_max_chars: nonNegativeInt,
    drawer_max_chars: nonNegativeInt,
    search_result_max_chars: nonNegativeInt,
  }),
});

const bindingStatusSchema = z.object({
  db: z.boolean(),
  r2: z.boolean(),
  ai: z.boolean(),
  vectorize: z.boolean(),
});

const warningSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const listRoomsSchema = {
  wing: z.string().optional(),
};

export const searchSchema = {
  query: z.string().min(1).max(250),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  wing: z.string().optional(),
  room: z.string().optional(),
  max_distance: z.coerce.number().min(0).max(2).optional(),
  context: z.string().optional(),
};

export const wakeContextSchema = {
  mode: z.enum(['global', 'scoped']),
  wing: z.string().optional(),
  room: z.string().optional(),
  max_items: z.coerce.number().int().min(1).max(20).optional(),
  max_chars: z.coerce.number().int().min(1).max(12000).optional(),
};

export const duplicateSchema = {
  content: z.string().min(1),
  threshold: z.coerce.number().min(0).max(1).optional(),
};

export const addDrawerSchema = {
  wing: z.string().min(1),
  room: z.string().min(1),
  content: z.string().min(1),
  source_file: z.string().optional(),
  added_by: z.string().optional(),
};

export const updateDrawerSchema = {
  drawer_id: z.string().min(1),
  content: z.string().optional(),
  wing: z.string().optional(),
  room: z.string().optional(),
  source_file: z.string().optional(),
  added_by: z.string().optional(),
  force_reindex: z.boolean().optional(),
};

export const deleteDrawerSchema = {
  drawer_id: z.string().min(1),
};

export const getDrawerSchema = {
  drawer_id: z.string().min(1),
};

export const listDrawersSchema = {
  wing: z.string().optional(),
  room: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
};

export const kgQuerySchema = {
  entity: z.string().min(1),
  as_of: z.string().optional(),
  direction: z.enum(['outgoing', 'incoming', 'both']).optional(),
};

export const kgAddSchema = {
  subject: z.string().min(1),
  predicate: z.string().min(1),
  object: z.string().min(1),
  valid_from: z.string().optional(),
  valid_to: z.string().optional(),
  confidence: z.coerce.number().min(0).max(1).optional(),
  source_drawer_id: z.string().optional(),
  source_closet: z.string().optional(),
  source_file: z.string().optional(),
};

export const kgInvalidateSchema = {
  subject: z.string().min(1),
  predicate: z.string().min(1),
  object: z.string().min(1),
  ended: z.string().optional(),
};

export const kgTimelineSchema = {
  entity: z.string().optional(),
};

export const kgCheckSchema = {
  entity: z.string().optional(),
  predicate: z.string().optional(),
  as_of: z.string().optional(),
  older_than_days: z.coerce.number().int().min(1).max(3650).optional(),
  predicates: z.array(z.string()).optional(),
  single_valued_predicates: z.array(z.string()).optional(),
  include_source_checks: z.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
};

export const traverseSchema = {
  start_room: z.string().min(1),
  max_hops: z.coerce.number().int().min(1).max(10).optional(),
};

export const findTunnelsSchema = {
  wing_a: z.string().optional(),
  wing_b: z.string().optional(),
};

export const createTunnelSchema = {
  source_wing: z.string().min(1),
  source_room: z.string().min(1),
  target_wing: z.string().min(1),
  target_room: z.string().min(1),
  label: z.string().optional(),
  source_drawer_id: z.string().optional(),
  target_drawer_id: z.string().optional(),
};

export const listTunnelsSchema = {
  wing: z.string().optional(),
};

export const deleteTunnelSchema = {
  tunnel_id: z.string().min(1),
};

export const followTunnelsSchema = {
  wing: z.string().min(1),
  room: z.string().min(1),
};

export const diaryWriteSchema = {
  agent_name: z.string().min(1),
  entry: z.string().min(1),
  topic: z.string().optional(),
  wing: z.string().optional(),
  room: z.string().optional(),
};

export const diaryReadSchema = {
  agent_name: z.string().min(1),
  last_n: z.coerce.number().int().min(1).max(100).optional(),
  wing: z.string().optional(),
  room: z.string().optional(),
};

export const diarySearchSchema = {
  agent_name: z.string().min(1),
  query: z.string().min(1).max(250),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  wing: z.string().optional(),
  room: z.string().optional(),
  topic: z.string().optional(),
  max_distance: z.coerce.number().min(0).max(2).optional(),
  context: z.string().optional(),
};

export const diaryReindexSchema = {
  entry_id: z.string().min(1).optional(),
  agent_name: z.string().min(1).optional(),
  wing: z.string().optional(),
  room: z.string().optional(),
  topic: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  dry_run: z.boolean().optional(),
};

export const hookSettingsSchema = {
  silent_save: z.boolean().optional(),
  desktop_toast: z.boolean().optional(),
};

export const syncSchema = {
  project_dir: z.string().optional(),
  wing: z.string().optional(),
  apply: z.boolean().optional(),
};

export const statusOutputSchema = z.object({
  total_drawers: nonNegativeInt,
  wings: countMapSchema,
  rooms: nonNegativeInt,
  protocol: z.array(z.string()),
  aaak_dialect: z.string(),
  backend: backendCapabilitiesSchema,
  quotas: quotaSnapshotSchema,
  kg_stats: z.object({
    entities: nonNegativeInt,
    triples: nonNegativeInt,
    current_facts: nonNegativeInt,
    expired_facts: nonNegativeInt,
    relationship_types: countMapSchema,
  }),
  graph_stats: z.object({
    total_rooms: nonNegativeInt,
    tunnel_rooms: nonNegativeInt,
    total_edges: nonNegativeInt,
    rooms_per_wing: countMapSchema,
    top_tunnels: z.array(roomGroupSchema),
  }),
  tenant_label: z.string(),
  binding_status: bindingStatusSchema,
  warnings: z.array(warningSchema),
});

export const listWingsOutputSchema = z.object({
  wings: countMapSchema,
});

export const listRoomsOutputSchema = z.object({
  wing: z.string(),
  rooms: countMapSchema,
});

export const getTaxonomyOutputSchema = z.object({
  taxonomy: taxonomySchema,
});

export const getAaakSpecOutputSchema = z.object({
  aaak_spec: z.string(),
});

export const wakeContextOutputSchema = z.object({
  mode: z.enum(['global', 'scoped']),
  scope: z.object({
    wing: z.string(),
    room: nullableString,
  }).nullable(),
  context_items: z.array(wakeContextItemSchema),
  instructions: z.array(z.string()),
  withheld: z.array(z.string()),
  limits: z.object({
    max_items: nonNegativeInt,
    max_chars: nonNegativeInt,
    returned_items: nonNegativeInt,
    returned_chars: nonNegativeInt,
  }),
});

export const searchOutputSchema = z.object({
  query: z.string(),
  filters: z.object({
    wing: nullableString,
    room: nullableString,
  }),
  results: z.array(searchResultItemSchema),
  context_received: nullableString.optional(),
});

export const duplicateOutputSchema = z.object({
  is_duplicate: z.boolean(),
  matches: z.array(duplicateMatchSchema),
});

export const getDrawerOutputSchema = z.object({
  drawer_id: z.string(),
  content: z.string(),
  wing: z.string(),
  room: z.string(),
  metadata: z.object({
    source_file: nullableString,
    added_by: nullableString,
    title: nullableString,
    created_at: z.string(),
    updated_at: z.string(),
    token_estimate: z.number().int().nullable(),
    content_chars: nonNegativeInt,
  }),
});

export const listDrawersOutputSchema = z.object({
  drawers: z.array(drawerSummaryItemSchema),
  total: nonNegativeInt,
  count: nonNegativeInt,
  offset: nonNegativeInt,
  limit: nonNegativeInt,
});

export const addDrawerOutputSchema = z.object({
  success: z.boolean(),
  reason: z.enum(['already_exists']).optional(),
  drawer_id: z.string(),
  wing: z.string(),
  room: z.string(),
  chunks: nonNegativeInt,
});

export const updateDrawerOutputSchema = z.object({
  success: z.boolean(),
  drawer_id: z.string(),
  wing: z.string(),
  room: z.string(),
  updated_fields: z.array(z.string()),
});

export const deleteDrawerOutputSchema = z.object({
  success: z.boolean(),
  drawer_id: z.string(),
  already_deleted: z.boolean().optional(),
});

export const diaryWriteOutputSchema = z.object({
  success: z.boolean(),
  entry_id: z.string(),
  agent: z.string(),
  topic: z.string(),
  timestamp: z.string(),
  wing: z.string(),
  room: z.string(),
  chunks: nonNegativeInt,
});

export const diaryReadOutputSchema = z.object({
  agent: z.string(),
  entries: z.array(diaryEntrySchema),
  total: nonNegativeInt,
  showing: nonNegativeInt,
  wing: nullableString,
  room: nullableString,
});

export const diarySearchOutputSchema = z.object({
  query: z.string(),
  filters: z.object({
    agent: z.string(),
    wing: nullableString,
    room: nullableString,
    topic: nullableString,
  }),
  results: z.array(diarySearchResultItemSchema),
  context_received: nullableString.optional(),
});

export const diaryReindexOutputSchema = z.object({
  success: z.boolean(),
  dry_run: z.boolean(),
  scope: z.object({
    entry_id: nullableString,
    agent: nullableString,
    wing: nullableString,
    room: nullableString,
    topic: nullableString,
  }),
  total: nonNegativeInt,
  count: nonNegativeInt,
  reindexed: nonNegativeInt,
  failed: nonNegativeInt,
  results: z.array(z.object({
    entry_id: z.string(),
    agent: z.string(),
    topic: z.string(),
    wing: z.string(),
    room: z.string(),
    success: z.boolean(),
    skipped: z.boolean().optional(),
    chunks: nonNegativeInt,
    error: z.string().optional(),
  })),
});

export const kgQueryOutputSchema = z.object({
  entity: z.string(),
  as_of: nullableString,
  facts: z.array(kgFactSchema),
  count: nonNegativeInt,
});

export const kgAddOutputSchema = z.object({
  success: z.boolean(),
  triple_id: z.string(),
  fact: z.object({
    subject: z.string(),
    predicate: z.string(),
    object: z.string(),
    valid_from: nullableString,
    valid_to: nullableString,
    confidence: z.number().nullable(),
  }),
});

export const kgInvalidateOutputSchema = z.object({
  success: z.boolean(),
  fact: z.object({
    subject: z.string(),
    predicate: z.string(),
    object: z.string(),
  }),
  ended: z.string(),
});

export const kgTimelineOutputSchema = z.object({
  entity: z.string(),
  timeline: z.array(kgTimelineItemSchema),
  count: nonNegativeInt,
});

const kgCheckFactSchema = kgFactSchema.extend({
  triple_id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const kgCheckOutputSchema = z.object({
  as_of: z.string(),
  scope: z.object({
    entity: nullableString,
    predicate: nullableString,
  }),
  summary: z.object({
    active_conflicts: nonNegativeInt,
    stale_facts: nonNegativeInt,
    source_warnings: nonNegativeInt,
  }),
  conflicts: z.array(z.object({
    code: z.string(),
    severity: z.string(),
    subject: z.string(),
    predicate: z.string(),
    objects: z.array(z.string()),
    facts: z.array(kgCheckFactSchema),
    suggested_action: z.string(),
  })),
  stale_facts: z.array(z.object({
    code: z.string(),
    severity: z.string(),
    age_days: nonNegativeInt,
    older_than_days: nonNegativeInt,
    fact: kgCheckFactSchema,
    suggested_action: z.string(),
  })),
  source_warnings: z.array(z.object({
    code: z.string(),
    severity: z.string(),
    source_drawer_id: nullableString,
    source_updated_at: z.string().optional(),
    fact: kgCheckFactSchema,
    message: z.string(),
  })),
  guidance: z.array(z.string()),
});

export const kgStatsOutputSchema = z.object({
  entities: nonNegativeInt,
  triples: nonNegativeInt,
  current_facts: nonNegativeInt,
  expired_facts: nonNegativeInt,
  relationship_types: countMapSchema,
});

export const traverseOutputSchema = z.object({
  start_room: z.string(),
  max_hops: nonNegativeInt,
  results: z.array(traverseResultSchema),
});

export const findTunnelsOutputSchema = z.object({
  tunnels: z.array(roomGroupSchema),
  count: nonNegativeInt,
});

export const graphStatsOutputSchema = z.object({
  total_rooms: nonNegativeInt,
  tunnel_rooms: nonNegativeInt,
  total_edges: nonNegativeInt,
  rooms_per_wing: countMapSchema,
  top_tunnels: z.array(roomGroupSchema),
});

export const createTunnelOutputSchema = z.object({
  success: z.boolean(),
  tunnel_id: z.string(),
  source: z.object({ wing: z.string(), room: z.string() }),
  target: z.object({ wing: z.string(), room: z.string() }),
  label: nullableString,
  id: z.string(),
});

export const listTunnelsOutputSchema = z.object({
  tunnels: z.array(tunnelRecordSchema),
  count: nonNegativeInt,
});

export const deleteTunnelOutputSchema = z.object({
  success: z.boolean(),
  tunnel_id: z.string(),
  deleted: z.string(),
});

export const followTunnelsOutputSchema = z.object({
  tunnels: z.array(followTunnelItemSchema),
});

export const hookSettingsOutputSchema = z.object({
  success: z.boolean(),
  settings: z.object({
    silent_save: z.boolean(),
    desktop_toast: z.boolean(),
  }),
  updated: z.boolean(),
  note: z.string(),
});

export const memoriesFiledAwayOutputSchema = z.object({
  status: z.enum(['ok', 'quiet']),
  message: z.string(),
  count: nonNegativeInt,
  timestamp: nullableString,
  cloud_mode: z.boolean(),
  note: z.string(),
});

export const reconnectOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  drawers: nonNegativeInt,
  vector_disabled: z.boolean(),
  vector_disabled_reason: nullableString,
});

export const syncOutputSchema = z.object({
  supported: z.literal(false),
  message: z.string(),
});
