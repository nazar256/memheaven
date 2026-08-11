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
  reserved_mcp_calls: nonNegativeInt,
  memory_reads: nonNegativeInt,
  memory_writes: nonNegativeInt,
  reserved_memory_writes: nonNegativeInt,
  vector_queries: nonNegativeInt,
  reserved_vector_queries: nonNegativeInt,
  embedding_input_chars: nonNegativeInt,
  reserved_embedding_input_chars: nonNegativeInt,
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
  deployment: z.string(),
  content_store: z.string(),
  vector_backend: z.string(),
  embedding_model: z.string(),
  embedding_dimensions: z.number().int().positive(),
  chunking_enabled: z.boolean(),
  ephemeral: z.boolean(),
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
  wing: z.string().describe('Optional wing to narrow the room counts; omit to aggregate rooms across the tenant.').optional(),
};

export const searchSchema = {
  query: z.string().min(1).max(250).describe('Natural-language or lexical text to find in tenant-scoped drawer memory.'),
  limit: z.coerce.number().int().min(1).max(100).describe('Maximum number of matching chunks to return after scope filtering.').optional(),
  wing: z.string().describe('Optional hard scope filter for one tenant wing.').optional(),
  room: z.string().describe('Optional hard scope filter for one room within the selected wing.').optional(),
  max_distance: z.coerce.number().min(0).max(2).describe('Optional maximum vector distance; lower values require closer semantic matches.').optional(),
  context: z.string().describe('Optional recent-chat context used to improve hybrid reranking; it is not stored.').optional(),
};

export const wakeContextSchema = {
  mode: z.enum(['global', 'scoped']).describe('Use global for curated cross-project orientation or scoped for one explicit wing.'),
  wing: z.string().describe('Required in scoped mode; identifies the wing whose context may be loaded.').optional(),
  room: z.string().describe('Optional room hard filter within the requested wing.').optional(),
  max_items: z.coerce.number().int().min(1).max(20).describe('Maximum number of context drawers to include.').optional(),
  max_chars: z.coerce.number().int().min(1).max(12000).describe('Maximum total context characters returned across selected drawers.').optional(),
};

export const duplicateSchema = {
  content: z.string().min(1).describe('Candidate drawer content to compare against existing tenant memory.'),
  threshold: z.coerce.number().min(0).max(1).describe('Minimum cosine similarity for a semantic duplicate match; higher is stricter.').optional(),
};

export const addDrawerSchema = {
  wing: z.string().min(1).describe('Tenant-scoped organizational wing for this durable memory.'),
  room: z.string().min(1).describe('Room inside the wing where this memory should be filed.'),
  content: z.string().min(1).describe('Verbatim source body or concise durable note to store and index.'),
  source_file: z.string().describe('Optional provenance label for the source document or file.').optional(),
  added_by: z.string().describe('Optional agent or workflow label that created the drawer.').optional(),
};

export const updateDrawerSchema = {
  drawer_id: z.string().min(1).describe('Identifier of the tenant-scoped drawer to update.'),
  content: z.string().describe('Replacement body; omit to preserve existing content.').optional(),
  wing: z.string().describe('Replacement wing; omit to preserve the current filing scope.').optional(),
  room: z.string().describe('Replacement room; omit to preserve the current filing scope.').optional(),
  source_file: z.string().describe('Replacement provenance label; omit to preserve the current value.').optional(),
  added_by: z.string().describe('Replacement creator label; omit to preserve the current value.').optional(),
  force_reindex: z.boolean().describe('Rebuild semantic chunks even when content and scope appear unchanged.').optional(),
};

export const deleteDrawerSchema = {
  drawer_id: z.string().min(1).describe('Identifier of the drawer to soft-delete from this tenant.'),
};

export const getDrawerSchema = {
  drawer_id: z.string().min(1).describe('Identifier of the tenant-scoped drawer to retrieve.'),
};

export const listDrawersSchema = {
  wing: z.string().describe('Optional hard filter for one wing.').optional(),
  room: z.string().describe('Optional hard filter for one room.').optional(),
  limit: z.coerce.number().int().min(1).max(100).describe('Maximum drawer summaries to return in this page.').optional(),
  offset: z.coerce.number().int().min(0).describe('Number of matching drawers to skip before returning this page.').optional(),
};

export const kgQuerySchema = {
  entity: z.string().min(1).describe('Entity name whose temporal facts should be returned.'),
  as_of: z.string().describe('Optional date or timestamp used to evaluate fact validity.').optional(),
  direction: z.enum(['outgoing', 'incoming', 'both']).describe('Whether to follow subject edges, object edges, or both.').optional(),
};

export const kgAddSchema = {
  subject: z.string().min(1).describe('Entity at the subject side of the relationship.'),
  predicate: z.string().min(1).describe('Relationship type, such as status, owns, or assigned_to.'),
  object: z.string().min(1).describe('Value or entity at the object side of the relationship.'),
  valid_from: z.string().describe('Optional inclusive start date or timestamp for this fact.').optional(),
  valid_to: z.string().describe('Optional exclusive end date or timestamp after which this fact is inactive.').optional(),
  confidence: z.coerce.number().min(0).max(1).describe('Optional confidence score from 0 to 1 for the asserted fact.').optional(),
  source_drawer_id: z.string().describe('Optional drawer identifier supporting this fact.').optional(),
  source_closet: z.string().describe('Optional provenance label for the source collection or closet.').optional(),
  source_file: z.string().describe('Optional source-file provenance label recorded with the fact audit.').optional(),
};

export const kgInvalidateSchema = {
  subject: z.string().min(1).describe('Subject of the exact fact to invalidate.'),
  predicate: z.string().min(1).describe('Predicate of the exact fact to invalidate.'),
  object: z.string().min(1).describe('Object of the exact fact to invalidate.'),
  ended: z.string().describe('Date or timestamp at which the fact stopped being valid.').optional(),
};

export const kgTimelineSchema = {
  entity: z.string().describe('Optional entity filter; omit to return the tenant timeline.').optional(),
};

export const kgCheckSchema = {
  entity: z.string().describe('Optional entity to constrain conflict and staleness checks.').optional(),
  predicate: z.string().describe('Optional predicate to constrain reliability checks.').optional(),
  as_of: z.string().describe('Date or timestamp used as the current-state reference point.').optional(),
  older_than_days: z.coerce.number().int().min(1).max(3650).describe('Age threshold for reporting stale facts.').optional(),
  predicates: z.array(z.string()).describe('Optional predicate allowlist for conflict checks.').optional(),
  single_valued_predicates: z.array(z.string()).describe('Predicates that should have at most one active object per subject.').optional(),
  include_source_checks: z.boolean().describe('Also warn when fact provenance points to missing or outdated drawers.').optional(),
  limit: z.coerce.number().int().min(1).max(200).describe('Maximum number of facts considered by the reliability checks.').optional(),
};

export const traverseSchema = {
  start_room: z.string().min(1).describe('Room name from which to traverse shared-room and explicit tunnel links.'),
  max_hops: z.coerce.number().int().min(1).max(10).describe('Maximum graph hops to follow; bounds traversal work and result breadth.').optional(),
};

export const findTunnelsSchema = {
  wing_a: z.string().describe('Optional first wing in a cross-wing shared-room search.').optional(),
  wing_b: z.string().describe('Optional second wing in a cross-wing shared-room search.').optional(),
};

export const createTunnelSchema = {
  source_wing: z.string().min(1).describe('Wing at the source endpoint of the explicit tunnel.'),
  source_room: z.string().min(1).describe('Room at the source endpoint of the explicit tunnel.'),
  target_wing: z.string().min(1).describe('Wing at the target endpoint of the explicit tunnel.'),
  target_room: z.string().min(1).describe('Room at the target endpoint of the explicit tunnel.'),
  label: z.string().describe('Optional human-readable reason or relationship label for the tunnel.').optional(),
  source_drawer_id: z.string().describe('Optional drawer anchoring the source endpoint.').optional(),
  target_drawer_id: z.string().describe('Optional drawer anchoring the target endpoint.').optional(),
};

export const listTunnelsSchema = {
  wing: z.string().describe('Optional wing filter for either endpoint of listed tunnels.').optional(),
};

export const deleteTunnelSchema = {
  tunnel_id: z.string().min(1).describe('Identifier of the explicit tunnel to delete.'),
};

export const followTunnelsSchema = {
  wing: z.string().min(1).describe('Wing whose connected tunnel endpoints should be followed.'),
  room: z.string().min(1).describe('Room whose connected tunnel endpoints should be followed.'),
};

export const diaryWriteSchema = {
  agent_name: z.string().min(1).describe('Explicit agent identity whose diary receives this entry.'),
  entry: z.string().min(1).describe('Concise readable session note or durable observation to store verbatim.'),
  topic: z.string().describe('Optional topic label used to organize and filter diary entries.').optional(),
  wing: z.string().describe('Optional memory wing for scoped diary retrieval.').optional(),
  room: z.string().describe('Optional room within the diary wing; defaults to the diary room.').optional(),
};

export const diaryReadSchema = {
  agent_name: z.string().min(1).describe('Explicit agent whose recent diary entries should be read.'),
  last_n: z.coerce.number().int().min(1).max(100).describe('Maximum number of recent entries to return.').optional(),
  wing: z.string().describe('Optional hard wing filter for diary entries.').optional(),
  room: z.string().describe('Optional hard room filter for diary entries.').optional(),
};

export const diarySearchSchema = {
  agent_name: z.string().min(1).describe('Explicit agent whose diary is searched; results never cross agents.'),
  query: z.string().min(1).max(250).describe('Natural-language or lexical text to find in the selected diary.'),
  limit: z.coerce.number().int().min(1).max(100).describe('Maximum diary chunks to return after hard filters.').optional(),
  wing: z.string().describe('Optional hard wing filter for diary search.').optional(),
  room: z.string().describe('Optional hard room filter for diary search.').optional(),
  topic: z.string().describe('Optional exact topic filter for diary search.').optional(),
  max_distance: z.coerce.number().min(0).max(2).describe('Optional maximum vector distance; lower values require closer matches.').optional(),
  context: z.string().describe('Optional recent-chat context used for reranking; it is not stored.').optional(),
};

export const diaryReindexSchema = {
  entry_id: z.string().min(1).describe('Optional single diary entry to reindex.').optional(),
  agent_name: z.string().min(1).describe('Optional agent filter for selecting entries to reindex.').optional(),
  wing: z.string().describe('Optional wing filter for selecting entries to reindex.').optional(),
  room: z.string().describe('Optional room filter for selecting entries to reindex.').optional(),
  topic: z.string().describe('Optional exact topic filter for selecting entries to reindex.').optional(),
  limit: z.coerce.number().int().min(1).max(100).describe('Maximum entries to process in this maintenance page.').optional(),
  offset: z.coerce.number().int().min(0).describe('Number of matching entries to skip before this maintenance page.').optional(),
  dry_run: z.boolean().describe('Report what would be reindexed without changing chunks or vectors.').optional(),
};

export const hookSettingsSchema = {
  silent_save: z.boolean().describe('Optional requested silent-save setting; this adapted tool reports the deployment policy.').optional(),
  desktop_toast: z.boolean().describe('Optional requested desktop-toast setting; local desktop notifications are not exposed.').optional(),
};

export const syncSchema = {
  project_dir: z.string().describe('Optional local project directory; unsupported because this deployment has no filesystem bridge.').optional(),
  wing: z.string().describe('Optional wing filter that would have limited a local sync.').optional(),
  apply: z.boolean().describe('Whether a supported sync would write changes; this deployment never applies filesystem sync.').optional(),
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
