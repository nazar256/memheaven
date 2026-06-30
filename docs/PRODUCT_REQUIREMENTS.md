# MemHeaven Product Requirements

## Goal

Build a Cloudflare-native TypeScript remote MCP server that preserves MemPalace's agent-facing behavior where practical while replacing local Python/ChromaDB/filesystem internals with Cloudflare Workers, D1, R2, Vectorize, and Workers AI.

## Behavioral reference audit

Sources audited:

- Upstream repo: `MemPalace/mempalace` (`develop` branch reference)
- Docs: MCP tools reference, MCP integration, Palace concept, Knowledge graph concept, compact memory-note / AAAK guidance, hooks, agents docs

## Compatibility matrix

| Original tool | Implemented? | Cloudflare behavior | Notes / rationale |
| --- | --- | --- | --- |
| `mempalace_status` | Yes | Status + Memory Protocol + backend capabilities + quota snapshot | Diagnostic/capability handshake; not wake-up memory context |
| `mempalace_wake_context` | Yes | Bounded privacy-scoped startup context; global mode only reads curated `wing=global` drawers, scoped mode requires explicit wing | Hosted extension for safe wake-up context |
| `mempalace_list_wings` | Yes | D1-backed tenant-scoped wing counts | Preserved |
| `mempalace_list_rooms` | Yes | D1-backed tenant-scoped room counts | Preserved |
| `mempalace_get_taxonomy` | Yes | D1 aggregation by wing/room | Preserved |
| `mempalace_get_aaak_spec` | Yes | Compact memory-note guidance; plain text by default, no literal `AAAK:` prefix unless explicitly requested | Preserved as protocol aid |
| `mempalace_search` | Yes | Workers AI embedding + Vectorize candidates + deterministic hybrid semantic/lexical reranking + D1/R2 hydration | Preserved semantics, storage redesigned |
| `mempalace_check_duplicate` | Yes | Exact hash + semantic similarity check within tenant | Preserved |
| `mempalace_add_drawer` | Yes | R2 verbatim source + D1 metadata + chunk vectors | Preserved |
| `mempalace_delete_drawer` | Yes | Soft delete in D1 + vector removal + R2 delete | Preserved with idempotent response |
| `mempalace_sync` | Adapted unsupported | Returns safe unsupported response | No local filesystem/project directory in hosted Worker |
| `mempalace_get_drawer` | Yes | D1 lookup + R2 read, bounded verbatim output | Preserved |
| `mempalace_list_drawers` | Yes | Tenant-scoped paginated D1 listing | Preserved |
| `mempalace_update_drawer` | Yes | Content/metadata update + reindex; optional `force_reindex` for maintenance | Preserved with small hosted extension |
| `mempalace_kg_query` | Yes | D1 temporal KG query | Preserved |
| `mempalace_kg_check` | Hosted extension | Deterministic KG reliability warnings for active conflicts, stale current-state facts, and source provenance | Narrow caution aid, not broad contradiction detection |
| `mempalace_kg_add` | Yes | D1 temporal triple insert | Preserved |
| `mempalace_kg_invalidate` | Yes | Sets `valid_to` for matching facts | Preserved |
| `mempalace_kg_timeline` | Yes | Tenant-scoped timeline query | Preserved |
| `mempalace_kg_stats` | Yes | D1 KG stats | Preserved |
| `mempalace_traverse` | Yes | Shared-room traversal + explicit tunnel traversal with hop cap | Preserved with bounded graph behavior |
| `mempalace_find_tunnels` | Yes | D1 aggregation of cross-wing shared rooms | Preserved |
| `mempalace_graph_stats` | Yes | D1 graph/tunnel statistics | Preserved |
| `mempalace_create_tunnel` | Yes | D1 explicit tunnel create | Preserved |
| `mempalace_list_tunnels` | Yes | D1 explicit tunnel list | Preserved |
| `mempalace_delete_tunnel` | Yes | D1 explicit tunnel delete | Preserved |
| `mempalace_follow_tunnels` | Yes | Follow explicit tunnels for one wing/room | Preserved |
| `mempalace_diary_write` | Yes | R2 verbatim diary + D1 scope metadata + chunk vectors for new entries | Preserved with hosted semantic index |
| `mempalace_diary_read` | Yes | Tenant/agent-scoped diary read from D1/R2 with optional wing/room hard filters | Preserved |
| `mempalace_diary_search` | Hosted extension | Explicit semantic search over tenant/agent-scoped diary entries; optional wing/room/topic hard filters; drawer search remains separate | Adds older diary recall without cross-agent mixing |
| `mempalace_diary_reindex` | Hosted extension | Tenant-scoped maintenance backfill from R2 diary bodies into D1 chunk rows and Vectorize | Operator recovery path after diary-search or metadata-index rollout |
| `mempalace_hook_settings` | Adapted | Returns hosted save policy; no desktop toast/local hook state | Safe cloud replacement |
| `mempalace_memories_filed_away` | Adapted | Returns latest write audit filing status per tenant | Replaces local hook checkpoint behavior |
| `mempalace_reconnect` | Adapted | Returns cloud binding/index health | No local Chroma cache to reconnect |

## Upstream audit notes

- Current upstream surface is approximately **30 tools**, despite some docs still mentioning 29.
- Tool docs and code differ in a few places; this port preserves names and core behavior first, then documents intentional normalization.
- Local-first upstream features (`sync`, hook settings, reconnect internals) require cloud-safe adaptation or omission.

## Compatibility goals

1. Preserve `mempalace_` tool names where practical.
2. Preserve the wings / rooms / drawers mental model.
3. Preserve `mempalace_status` as Memory Protocol diagnostics and use `mempalace_wake_context` for bounded startup memory context.
4. Preserve verbatim drawer storage as the system of record.
5. Preserve search-first memory behavior.
6. Preserve temporal KG semantics and diary behavior.
7. Preserve graph/tunnel navigation within bounded Cloudflare-safe limits.
8. Use synthetic behavior evals to catch regressions in retrieval, scoping, tenant isolation, and KG lifecycle behavior before making quality claims.

## Explicit normalizations / hosted extensions

- Search responses include `drawer_id` and `chunk_index` to make follow-up fetches reliable for MCP clients.
- `mempalace_update_drawer` accepts optional `force_reindex` for hosted reindex maintenance after Vectorize metadata-index rollout.
- `mempalace_diary_search` is explicit and agent-scoped; normal `mempalace_search` remains drawer-only by default.
- `mempalace_diary_reindex` and `npm run reindex -- --kind diary` backfill existing diary entries after the hosted semantic diary index is introduced.
- `mempalace_status` exposes Cloudflare binding health, quotas, and backend capabilities instead of local runtime details.
- Local-only tools are adapted to cloud-safe informational behavior rather than pretending local functionality exists.
- `evals/` and `npm run eval:*` provide MemHeaven self-benchmarks with synthetic data. Direct MemHeaven-vs-MemPalace comparison is optional future work, not a current product claim.

## Non-goals

- No Python runtime compatibility.
- No ChromaDB/SQLite file compatibility.
- No local filesystem or Claude Code hook behavior.
- No attempt to port Chroma/HNSW internals directly.
