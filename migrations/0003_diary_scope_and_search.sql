alter table diary_entries add column wing text not null default '';
alter table diary_entries add column room text not null default 'diary';
alter table diary_entries add column updated_at text;

update diary_entries
   set wing = 'wing_' || agent_name
 where wing = '';

update diary_entries
   set updated_at = created_at
 where updated_at is null;

create table if not exists diary_chunks(
  id text primary key,
  tenant_id text not null,
  diary_id text not null,
  chunk_index integer not null,
  vector_id text not null,
  chunk_text text not null,
  chunk_chars integer not null,
  created_at text not null,
  foreign key(diary_id) references diary_entries(id)
);

create index if not exists idx_diary_scope_time on diary_entries(tenant_id, agent_name, wing, room, topic, created_at);
create index if not exists idx_diary_chunks_tenant_diary on diary_chunks(tenant_id, diary_id);
create index if not exists idx_diary_chunks_tenant_vector on diary_chunks(tenant_id, vector_id);

-- Existing diary bodies live in R2 and require Workers AI plus Vectorize for
-- semantic backfill. After applying this migration on an existing deployment,
-- run npm run init to ensure Vectorize metadata indexes, then run:
-- npm run reindex -- --kind diary --base https://your-domain.example
