export const INITIAL_MIGRATION_SQL = `
create table if not exists drawers(
  id text primary key,
  tenant_id text not null,
  wing text not null,
  room text not null,
  hall text,
  title text,
  source_file text,
  added_by text,
  content_hash text not null,
  r2_key text not null,
  content_chars integer not null,
  token_estimate integer,
  created_at text not null,
  updated_at text not null,
  deleted_at text
);

create table if not exists drawer_chunks(
  id text primary key,
  tenant_id text not null,
  drawer_id text not null,
  chunk_index integer not null,
  vector_id text not null,
  chunk_text text not null,
  chunk_chars integer not null,
  created_at text not null,
  foreign key(drawer_id) references drawers(id)
);

create table if not exists kg_entities(
  id text primary key,
  tenant_id text not null,
  name text not null,
  normalized_name text not null,
  type text,
  properties_json text,
  created_at text not null,
  updated_at text not null
);

create table if not exists kg_triples(
  id text primary key,
  tenant_id text not null,
  subject text not null,
  predicate text not null,
  object text not null,
  valid_from text,
  valid_to text,
  confidence real,
  source_drawer_id text,
  source_closet text,
  created_at text not null,
  updated_at text not null
);

create table if not exists tunnels(
  id text primary key,
  tenant_id text not null,
  source_wing text not null,
  source_room text not null,
  target_wing text not null,
  target_room text not null,
  label text,
  source_drawer_id text,
  target_drawer_id text,
  created_at text not null
);

create table if not exists diary_entries(
  id text primary key,
  tenant_id text not null,
  agent_name text not null,
  topic text not null,
  r2_key text not null,
  content_hash text not null,
  created_at text not null
);

create table if not exists usage_counters(
  tenant_id text not null,
  day text not null,
  mcp_calls integer not null default 0,
  memory_reads integer not null default 0,
  memory_writes integer not null default 0,
  vector_queries integer not null default 0,
  embedding_input_chars integer not null default 0,
  r2_reads integer not null default 0,
  r2_writes integer not null default 0,
  primary key(tenant_id, day)
);

create table if not exists write_audit_log(
  id text primary key,
  tenant_id text not null,
  operation text not null,
  redacted_params_json text not null,
  result_json text,
  created_at text not null
);

create index if not exists idx_drawers_tenant_wing_room on drawers(tenant_id, wing, room, deleted_at);
create index if not exists idx_drawers_tenant_updated on drawers(tenant_id, updated_at);
create index if not exists idx_chunks_tenant_drawer on drawer_chunks(tenant_id, drawer_id);
create index if not exists idx_chunks_tenant_vector on drawer_chunks(tenant_id, vector_id);
create index if not exists idx_kg_subject on kg_triples(tenant_id, subject);
create index if not exists idx_kg_object on kg_triples(tenant_id, object);
create index if not exists idx_kg_validity on kg_triples(tenant_id, valid_from, valid_to);
create index if not exists idx_tunnels_source on tunnels(tenant_id, source_wing, source_room);
create index if not exists idx_tunnels_target on tunnels(tenant_id, target_wing, target_room);
create index if not exists idx_diary_agent_time on diary_entries(tenant_id, agent_name, created_at);
`;
