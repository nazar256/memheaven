alter table usage_counters add column reserved_mcp_calls integer not null default 0;
alter table usage_counters add column reserved_memory_writes integer not null default 0;
alter table usage_counters add column reserved_vector_queries integer not null default 0;
alter table usage_counters add column reserved_embedding_input_chars integer not null default 0;

create table if not exists oauth_authorization_codes(
  jti text primary key,
  client_id text not null,
  expires_at integer not null,
  consumed_at integer not null
);

create table if not exists oauth_refresh_sessions(
  session_id text primary key,
  tenant_id text not null,
  client_id text not null,
  subject text not null,
  expires_at integer not null,
  revoked_at integer
);

create table if not exists oauth_refresh_tokens(
  jti text primary key,
  session_id text not null,
  client_id text not null,
  parent_jti text,
  expires_at integer not null,
  consumed_at integer,
  replaced_by_jti text
);

create table if not exists auth_rate_limits(
  bucket text primary key,
  window_started_at integer not null,
  count integer not null default 0
);
