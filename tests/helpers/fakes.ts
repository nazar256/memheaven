import type { AiBindingLike, AppEnv, D1DatabaseLike, PreparedStatementLike, R2BucketLike, R2ObjectLike, StatementResult, StatementRunResult, VectorizeIndexLike, VectorizeMatch, VectorizeMatches, VectorizeMutation, VectorizeVector } from '../../src/config';

type CounterRow = {
  tenant_id: string;
  day: string;
  mcp_calls: number;
  memory_reads: number;
  memory_writes: number;
  vector_queries: number;
  embedding_input_chars: number;
  r2_reads: number;
  r2_writes: number;
};

type Drawer = {
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
};

type DrawerChunk = {
  id: string;
  tenant_id: string;
  drawer_id: string;
  chunk_index: number;
  vector_id: string;
  chunk_text: string;
  chunk_chars: number;
  created_at: string;
};

type DiaryEntry = {
  id: string;
  tenant_id: string;
  agent_name: string;
  topic: string;
  r2_key: string;
  content_hash: string;
  created_at: string;
};

type Tunnel = {
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
};

type KgEntity = {
  id: string;
  tenant_id: string;
  name: string;
  normalized_name: string;
  type: string | null;
  properties_json: string | null;
  created_at: string;
  updated_at: string;
};

type KgTriple = {
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
};

type Audit = {
  id: string;
  tenant_id: string;
  operation: string;
  redacted_params_json: string;
  result_json: string | null;
  created_at: string;
};

type MemoryStore = {
  drawers: Drawer[];
  drawer_chunks: DrawerChunk[];
  diary_entries: DiaryEntry[];
  kg_entities: KgEntity[];
  kg_triples: KgTriple[];
  tunnels: Tunnel[];
  usage_counters: CounterRow[];
  write_audit_log: Audit[];
};

class FakeStatement implements PreparedStatementLike {
  constructor(
    private readonly store: MemoryStore,
    private readonly query: string,
    private values: unknown[] = [],
  ) {}

  bind(...values: unknown[]): PreparedStatementLike {
    this.values = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    const rows = this.execute<T>();
    return rows[0] ?? null;
  }

  async all<T>(): Promise<StatementResult<T>> {
    return { success: true, results: this.execute<T>() };
  }

  async run(): Promise<StatementRunResult> {
    this.execute<void>();
    return { success: true };
  }

  private execute<T>(): T[] {
    const query = normalize(this.query);
    if (query.startsWith('select tenant_id, day, mcp_calls')) {
      const [tenantId, day] = this.values as [string, string];
      return this.store.usage_counters.filter((row) => row.tenant_id === tenantId && row.day === day) as T[];
    }
    if (query.startsWith('insert into usage_counters')) {
      const [tenantId, day, mcp, reads, writes, vq, chars, r2r, r2w] = this.values as [string, string, number, number, number, number, number, number, number];
      const row = this.store.usage_counters.find((item) => item.tenant_id === tenantId && item.day === day);
      if (row) {
        row.mcp_calls += mcp;
        row.memory_reads += reads;
        row.memory_writes += writes;
        row.vector_queries += vq;
        row.embedding_input_chars += chars;
        row.r2_reads += r2r;
        row.r2_writes += r2w;
      } else {
        this.store.usage_counters.push({ tenant_id: tenantId, day, mcp_calls: mcp, memory_reads: reads, memory_writes: writes, vector_queries: vq, embedding_input_chars: chars, r2_reads: r2r, r2_writes: r2w });
      }
      return [];
    }
    if (query.startsWith('insert into write_audit_log')) {
      const [id, tenantId, operation, params, result, createdAt] = this.values as [string, string, string, string, string | null, string];
      this.store.write_audit_log.push({ id, tenant_id: tenantId, operation, redacted_params_json: params, result_json: result, created_at: createdAt });
      return [];
    }
    if (query.startsWith('select count(*) as count, max(created_at) as latest from write_audit_log')) {
      const [tenantId] = this.values as [string];
      const rows = this.store.write_audit_log.filter((row) => row.tenant_id === tenantId);
      return [{ count: rows.length, latest: rows.map((row) => row.created_at).sort().at(-1) ?? null }] as T[];
    }
    if (query.startsWith('insert into drawers')) {
      const [id, tenantId, wing, room, hall, title, sourceFile, addedBy, contentHash, r2Key, contentChars, tokenEstimate, createdAt, updatedAt] = this.values as [string, string, string, string, string | null, string | null, string | null, string | null, string, string, number, number | null, string, string];
      const existing = this.store.drawers.find((row) => row.id === id);
      if (existing) {
        Object.assign(existing, { wing, room, hall, title, source_file: sourceFile, added_by: addedBy, content_hash: contentHash, r2_key: r2Key, content_chars: contentChars, token_estimate: tokenEstimate, updated_at: updatedAt, deleted_at: null });
      } else {
        this.store.drawers.push({ id, tenant_id: tenantId, wing, room, hall, title, source_file: sourceFile, added_by: addedBy, content_hash: contentHash, r2_key: r2Key, content_chars: contentChars, token_estimate: tokenEstimate, created_at: createdAt, updated_at: updatedAt, deleted_at: null });
      }
      return [];
    }
    if (query.startsWith('select id, tenant_id, wing, room, hall, title, source_file, added_by, content_hash, r2_key, content_chars, token_estimate, created_at, updated_at, deleted_at from drawers where tenant_id = ? and id = ?')) {
      const [tenantId, id] = this.values as [string, string];
      return this.store.drawers.filter((row) => row.tenant_id === tenantId && row.id === id) as T[];
    }
    if (query.startsWith('select id from drawers where tenant_id = ? and id = ? and deleted_at is null')) {
      const [tenantId, id] = this.values as [string, string];
      return this.store.drawers.filter((row) => row.tenant_id === tenantId && row.id === id && row.deleted_at === null).map((row) => ({ id: row.id })) as T[];
    }
    if (query.startsWith('select id, tenant_id, drawer_id, chunk_index, vector_id, chunk_text, chunk_chars, created_at from drawer_chunks where tenant_id = ? and drawer_id = ?')) {
      const [tenantId, drawerId] = this.values as [string, string];
      return this.store.drawer_chunks.filter((row) => row.tenant_id === tenantId && row.drawer_id === drawerId).sort((a, b) => a.chunk_index - b.chunk_index) as T[];
    }
    if (query.startsWith('delete from drawer_chunks where tenant_id = ? and drawer_id = ?')) {
      const [tenantId, drawerId] = this.values as [string, string];
      this.store.drawer_chunks = this.store.drawer_chunks.filter((row) => !(row.tenant_id === tenantId && row.drawer_id === drawerId));
      return [];
    }
    if (query.startsWith('insert into drawer_chunks')) {
      const [id, tenantId, drawerId, chunkIndex, vectorId, chunkText, chunkChars, createdAt] = this.values as [string, string, string, number, string, string, number, string];
      this.store.drawer_chunks.push({ id, tenant_id: tenantId, drawer_id: drawerId, chunk_index: chunkIndex, vector_id: vectorId, chunk_text: chunkText, chunk_chars: chunkChars, created_at: createdAt });
      return [];
    }
    if (query.startsWith('select count(*) as total from drawers where tenant_id = ? and deleted_at is null and content_hash = ?')) {
      const [tenantId, contentHash] = this.values as [string, string];
      return [{ total: this.store.drawers.filter((row) => row.tenant_id === tenantId && row.deleted_at === null && row.content_hash === contentHash).length }] as T[];
    }
    if (query.startsWith('select id, tenant_id, wing, room, hall, title, source_file, added_by, content_hash, r2_key, content_chars, token_estimate, created_at, updated_at, deleted_at from drawers where tenant_id = ? and deleted_at is null and content_hash = ?')) {
      const [tenantId, contentHash] = this.values as [string, string];
      return this.store.drawers.filter((row) => row.tenant_id === tenantId && row.deleted_at === null && row.content_hash === contentHash) as T[];
    }
    if (query.startsWith('select count(*) as total from drawers where')) {
      const [tenantId] = this.values as [string];
      return [{ total: this.store.drawers.filter((row) => row.tenant_id === tenantId && row.deleted_at === null).length }] as T[];
    }
    if (query.includes('from drawers') && query.includes('order by updated_at desc') && query.includes('limit ? offset ?')) {
      const values = this.values as unknown[];
      const tenantId = values[0] as string;
      const limit = values.at(-2) as number;
      const offset = values.at(-1) as number;
      let rows = this.store.drawers.filter((row) => row.tenant_id === tenantId && row.deleted_at === null);
      if (query.includes('wing = ?')) {
        rows = rows.filter((row) => row.wing === values[1]);
      }
      if (query.includes('room = ?')) {
        const roomValue = values[query.includes('wing = ?') ? 2 : 1];
        rows = rows.filter((row) => row.room === roomValue);
      }
      return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(offset, offset + limit) as T[];
    }
    if (query.startsWith('update drawers set wing = ?, room = ?, source_file = ?, added_by = ?, title = ?, content_hash = ?, content_chars = ?, token_estimate = ?, updated_at = ?, deleted_at = null where tenant_id = ? and id = ?')) {
      const [wing, room, sourceFile, addedBy, title, contentHash, contentChars, tokenEstimate, updatedAt, tenantId, drawerId] = this.values as [string, string, string | null, string | null, string | null, string, number, number | null, string, string, string];
      const row = this.store.drawers.find((item) => item.tenant_id === tenantId && item.id === drawerId);
      if (row) {
        Object.assign(row, { wing, room, source_file: sourceFile, added_by: addedBy, title, content_hash: contentHash, content_chars: contentChars, token_estimate: tokenEstimate, updated_at: updatedAt, deleted_at: null });
      }
      return [];
    }
    if (query.startsWith('update drawers set deleted_at = ?, updated_at = ? where tenant_id = ? and id = ?')) {
      const [deletedAt, updatedAt, tenantId, drawerId] = this.values as [string, string, string, string];
      const row = this.store.drawers.find((item) => item.tenant_id === tenantId && item.id === drawerId);
      if (row) {
        row.deleted_at = deletedAt;
        row.updated_at = updatedAt;
      }
      return [];
    }
    if (query.includes('from drawer_chunks c') && query.includes('join drawers d')) {
      const tenantId = this.values[0] as string;
      const vectorIds = this.values.slice(1) as string[];
      const rows = this.store.drawer_chunks
        .filter((chunk) => chunk.tenant_id === tenantId && vectorIds.includes(chunk.vector_id))
        .map((chunk) => {
          const drawer = this.store.drawers.find((item) => item.id === chunk.drawer_id && item.tenant_id === chunk.tenant_id && item.deleted_at === null);
          if (!drawer) return null;
          return { ...chunk, wing: drawer.wing, room: drawer.room, source_file: drawer.source_file, updated_at: drawer.updated_at, drawer_created_at: drawer.created_at, deleted_at: drawer.deleted_at, r2_key: drawer.r2_key };
        })
        .filter(Boolean);
      return rows as T[];
    }
    if (query.startsWith('select wing, count(*) as count from drawers')) {
      const [tenantId] = this.values as [string];
      const rows = aggregate(this.store.drawers.filter((row) => row.tenant_id === tenantId && row.deleted_at === null), 'wing');
      return rows as T[];
    }
    if (query.startsWith('select room, count(*) as count from drawers')) {
      const tenantId = this.values[0] as string;
      let rows = this.store.drawers.filter((row) => row.tenant_id === tenantId && row.deleted_at === null);
      if (query.includes('wing = ?')) {
        rows = rows.filter((row) => row.wing === this.values[1]);
      }
      return aggregate(rows, 'room') as T[];
    }
    if (query.startsWith('select wing, room, count(*) as count from drawers')) {
      const [tenantId] = this.values as [string];
      const grouped = new Map<string, { wing: string; room: string; count: number }>();
      for (const row of this.store.drawers.filter((item) => item.tenant_id === tenantId && item.deleted_at === null)) {
        const key = `${row.wing}::${row.room}`;
        const existing = grouped.get(key) ?? { wing: row.wing, room: row.room, count: 0 };
        existing.count += 1;
        grouped.set(key, existing);
      }
      return Array.from(grouped.values()) as T[];
    }
    if (query.startsWith('select count(*) as total from drawers where tenant_id = ? and deleted_at is null')) {
      const [tenantId] = this.values as [string];
      return [{ total: this.store.drawers.filter((row) => row.tenant_id === tenantId && row.deleted_at === null).length }] as T[];
    }
    if (query.startsWith("select count(distinct wing || ':' || room) as total from drawers where tenant_id = ? and deleted_at is null")) {
      const [tenantId] = this.values as [string];
      return [{ total: new Set(this.store.drawers.filter((row) => row.tenant_id === tenantId && row.deleted_at === null).map((row) => `${row.wing}:${row.room}`)).size }] as T[];
    }
    if (query.startsWith('insert into diary_entries')) {
      const [id, tenantId, agentName, topic, r2Key, contentHash, createdAt] = this.values as [string, string, string, string, string, string, string];
      this.store.diary_entries.push({ id, tenant_id: tenantId, agent_name: agentName, topic, r2_key: r2Key, content_hash: contentHash, created_at: createdAt });
      return [];
    }
    if (query.startsWith('select id, tenant_id, agent_name, topic, r2_key, content_hash, created_at from diary_entries')) {
      const [tenantId, agentName, limit] = this.values as [string, string, number];
      return this.store.diary_entries.filter((row) => row.tenant_id === tenantId && row.agent_name === agentName).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit) as T[];
    }
    if (query.startsWith('select count(*) as total from diary_entries')) {
      const [tenantId, agentName] = this.values as [string, string];
      return [{ total: this.store.diary_entries.filter((row) => row.tenant_id === tenantId && row.agent_name === agentName).length }] as T[];
    }
    if (query.startsWith('select id, tenant_id, name, normalized_name, type, properties_json, created_at, updated_at from kg_entities')) {
      const [tenantId, normalizedName] = this.values as [string, string];
      return this.store.kg_entities.filter((row) => row.tenant_id === tenantId && row.normalized_name === normalizedName) as T[];
    }
    if (query.startsWith('insert into kg_entities')) {
      const [id, tenantId, name, normalizedName, createdAt, updatedAt] = this.values as [string, string, string, string, string, string];
      this.store.kg_entities.push({ id, tenant_id: tenantId, name, normalized_name: normalizedName, type: null, properties_json: null, created_at: createdAt, updated_at: updatedAt });
      return [];
    }
    if (query.startsWith('insert into kg_triples')) {
      const [id, tenantId, subject, predicate, object, validFrom, validTo, confidence, sourceDrawerId, sourceCloset, createdAt, updatedAt] = this.values as [string, string, string, string, string, string | null, string | null, number | null, string | null, string | null, string, string];
      this.store.kg_triples.push({ id, tenant_id: tenantId, subject, predicate, object, valid_from: validFrom, valid_to: validTo, confidence, source_drawer_id: sourceDrawerId, source_closet: sourceCloset, created_at: createdAt, updated_at: updatedAt });
      return [];
    }
    if (query.startsWith('update kg_triples')) {
      const [ended, updatedAt, tenantId, subject, predicate, object] = this.values as [string, string, string, string, string, string, string];
      for (const row of this.store.kg_triples) {
        if (row.tenant_id === tenantId && row.subject === subject && row.predicate === predicate && row.object === object && (row.valid_to === null || row.valid_to > ended)) {
          row.valid_to = ended;
          row.updated_at = updatedAt;
        }
      }
      return [];
    }
    if (query.startsWith('select id, tenant_id, subject, predicate, object, valid_from, valid_to, confidence, source_drawer_id, source_closet, created_at, updated_at from kg_triples where')) {
      const tenantId = this.values[0] as string;
      const rows = this.store.kg_triples.filter((row) => row.tenant_id === tenantId);
      if (query.includes('subject = ? and predicate = ? and object = ?')) {
        return rows as T[];
      }
      return rows as T[];
    }
    if (query.startsWith('select count(*) as total from kg_entities')) {
      const [tenantId] = this.values as [string];
      return [{ total: this.store.kg_entities.filter((row) => row.tenant_id === tenantId).length }] as T[];
    }
    if (query.startsWith('select count(*) as total from kg_triples where tenant_id = ? and (valid_to is null or valid_to > ?)')) {
      const [tenantId, asOf] = this.values as [string, string];
      return [{ total: this.store.kg_triples.filter((row) => row.tenant_id === tenantId && (row.valid_to === null || row.valid_to > asOf)).length }] as T[];
    }
    if (query.startsWith('select count(*) as total from kg_triples where tenant_id = ? and valid_to is not null and valid_to <= ?')) {
      const [tenantId, asOf] = this.values as [string, string];
      return [{ total: this.store.kg_triples.filter((row) => row.tenant_id === tenantId && row.valid_to !== null && row.valid_to <= asOf).length }] as T[];
    }
    if (query.startsWith('select count(*) as total from kg_triples where tenant_id = ?')) {
      const [tenantId] = this.values as [string];
      return [{ total: this.store.kg_triples.filter((row) => row.tenant_id === tenantId).length }] as T[];
    }
    if (query.startsWith('select predicate, count(*) as count from kg_triples')) {
      const [tenantId] = this.values as [string];
      return aggregate(this.store.kg_triples.filter((row) => row.tenant_id === tenantId), 'predicate') as T[];
    }
    if (query.startsWith('insert into tunnels')) {
      const [id, tenantId, sourceWing, sourceRoom, targetWing, targetRoom, label, sourceDrawerId, targetDrawerId, createdAt] = this.values as [string, string, string, string, string, string, string | null, string | null, string | null, string];
      if (!this.store.tunnels.find((row) => row.id === id)) {
        this.store.tunnels.push({ id, tenant_id: tenantId, source_wing: sourceWing, source_room: sourceRoom, target_wing: targetWing, target_room: targetRoom, label, source_drawer_id: sourceDrawerId, target_drawer_id: targetDrawerId, created_at: createdAt });
      }
      return [];
    }
    if (query.startsWith('select id, tenant_id, source_wing, source_room, target_wing, target_room, label, source_drawer_id, target_drawer_id, created_at from tunnels where tenant_id = ? and ((source_wing = ? and source_room = ?) or (target_wing = ? and target_room = ?))')) {
      const [tenantId, sourceWing, sourceRoom, targetWing, targetRoom] = this.values as [string, string, string, string, string];
      return this.store.tunnels.filter((row) => row.tenant_id === tenantId && ((row.source_wing === sourceWing && row.source_room === sourceRoom) || (row.target_wing === targetWing && row.target_room === targetRoom))) as T[];
    }
    if (query.startsWith('select id, tenant_id, source_wing, source_room, target_wing, target_room, label, source_drawer_id, target_drawer_id, created_at from tunnels where tenant_id = ?')) {
      const [tenantId] = this.values as [string];
      return this.store.tunnels.filter((row) => row.tenant_id === tenantId) as T[];
    }
    if (query.startsWith('delete from tunnels where tenant_id = ? and id = ?')) {
      const [tenantId, id] = this.values as [string, string];
      this.store.tunnels = this.store.tunnels.filter((row) => !(row.tenant_id === tenantId && row.id === id));
      return [];
    }
    if (query.startsWith('select distinct wing, room from drawers where tenant_id = ? and deleted_at is null')) {
      const [tenantId] = this.values as [string];
      const seen = new Set<string>();
      const rows = [] as Array<{ wing: string; room: string }>;
      for (const row of this.store.drawers.filter((item) => item.tenant_id === tenantId && item.deleted_at === null)) {
        const key = `${row.wing}:${row.room}`;
        if (!seen.has(key)) {
          seen.add(key);
          rows.push({ wing: row.wing, room: row.room });
        }
      }
      return rows as T[];
    }
    if (query.startsWith('select count(distinct source_wing ||')) {
      const [tenantId] = this.values as [string];
      const sources = new Set(this.store.tunnels.filter((row) => row.tenant_id === tenantId).map((row) => `${row.source_wing}:${row.source_room}`));
      const targets = new Set(this.store.tunnels.filter((row) => row.tenant_id === tenantId).map((row) => `${row.target_wing}:${row.target_room}`));
      return [{ total: sources.size + targets.size }] as T[];
    }
    if (query.startsWith('select count(*) as total from tunnels where tenant_id = ?')) {
      const [tenantId] = this.values as [string];
      return [{ total: this.store.tunnels.filter((row) => row.tenant_id === tenantId).length }] as T[];
    }
    if (query.startsWith('select wing, count(distinct room) as count from drawers where tenant_id = ? and deleted_at is null group by wing')) {
      const [tenantId] = this.values as [string];
      const byWing = new Map<string, Set<string>>();
      for (const row of this.store.drawers.filter((item) => item.tenant_id === tenantId && item.deleted_at === null)) {
        byWing.set(row.wing, byWing.get(row.wing) ?? new Set());
        byWing.get(row.wing)?.add(row.room);
      }
      return Array.from(byWing.entries()).map(([wing, rooms]) => ({ wing, count: rooms.size })) as T[];
    }
    if (query.startsWith('select room, count(distinct wing) as wings, count(*) as count, max(updated_at) as recent from drawers')) {
      const [tenantId] = this.values as [string];
      const rows = this.store.drawers.filter((row) => row.tenant_id === tenantId && row.deleted_at === null);
      const grouped = new Map<string, { room: string; wings: Set<string>; count: number; recent: string }>();
      for (const row of rows) {
        const entry = grouped.get(row.room) ?? { room: row.room, wings: new Set(), count: 0, recent: row.updated_at };
        entry.wings.add(row.wing);
        entry.count += 1;
        if (row.updated_at > entry.recent) entry.recent = row.updated_at;
        grouped.set(row.room, entry);
      }
      return Array.from(grouped.values()).filter((row) => row.wings.size > 1).map((row) => ({ room: row.room, wings: row.wings.size, count: row.count, recent: row.recent })) as T[];
    }
    if (query.startsWith('select distinct wing from drawers where tenant_id = ? and deleted_at is null and room = ?')) {
      const [tenantId, room] = this.values as [string, string];
      return Array.from(new Set(this.store.drawers.filter((row) => row.tenant_id === tenantId && row.deleted_at === null && row.room === room).map((row) => row.wing))).map((wing) => ({ wing })) as T[];
    }
    if (query.startsWith('select r2_key from drawers where tenant_id = ? and id = ? and deleted_at is null')) {
      const [tenantId, id] = this.values as [string, string];
      const drawer = this.store.drawers.find((row) => row.tenant_id === tenantId && row.id === id && row.deleted_at === null);
      return drawer ? ([{ r2_key: drawer.r2_key }] as T[]) : [];
    }

    throw new Error(`Unsupported query in fake D1: ${query}`);
  }
}

function normalize(query: string): string {
  return query.replace(/\s+/g, ' ').trim().toLowerCase();
}

function aggregate<T extends Record<string, unknown>>(rows: T[], key: keyof T) {
  const grouped = new Map<string, { [name: string]: unknown }>();
  for (const row of rows) {
    const name = String(row[key]);
    const existing = grouped.get(name) ?? { [String(key)]: name, count: 0 };
    existing.count = Number(existing.count) + 1;
    grouped.set(name, existing);
  }
  return Array.from(grouped.values()).sort((left, right) => String(left[key as string]).localeCompare(String(right[key as string])));
}

export class FakeD1Database implements D1DatabaseLike {
  readonly store: MemoryStore = {
    drawers: [],
    drawer_chunks: [],
    diary_entries: [],
    kg_entities: [],
    kg_triples: [],
    tunnels: [],
    usage_counters: [],
    write_audit_log: [],
  };

  prepare(query: string): PreparedStatementLike {
    return new FakeStatement(this.store, query);
  }

  async batch<T = unknown>(statements: PreparedStatementLike[]): Promise<T[]> {
    const output: T[] = [];
    for (const statement of statements) {
      output.push((await statement.run()) as T);
    }
    return output;
  }
}

export class FakeR2Bucket implements R2BucketLike {
  readonly objects = new Map<string, string>();

  async get(key: string): Promise<R2ObjectLike | null> {
    const value = this.objects.get(key);
    if (value === undefined) {
      return null;
    }
    return {
      body: { text: async () => value },
      text: async () => value,
    };
  }

  async put(key: string, value: string): Promise<void> {
    this.objects.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

export class FakeAI implements AiBindingLike {
  async run(_model: string, inputs: Record<string, unknown>): Promise<unknown> {
    const texts = Array.isArray(inputs.text) ? (inputs.text as string[]) : [String(inputs.text ?? '')];
    return {
      shape: [texts.length, 384],
      data: texts.map((text) => embed(text)),
    };
  }
}

export class FakeVectorize implements VectorizeIndexLike {
  readonly vectors = new Map<string, VectorizeVector>();

  async describe() {
    return { dimensions: 384, vectorCount: this.vectors.size };
  }

  async query(vector: number[] | Float32Array | Float64Array, options?: Record<string, unknown>): Promise<VectorizeMatches> {
    const filter = (options?.filter as Record<string, unknown> | undefined) ?? {};
    const topK = Number(options?.topK ?? 5);
    const matches = [...this.vectors.values()]
      .filter((candidate) => matchesFilter(candidate.metadata ?? {}, filter))
      .map((candidate) => ({
        id: candidate.id,
        score: cosine(Array.from(vector), Array.from(candidate.values as number[])),
        metadata: candidate.metadata ?? {},
      } satisfies VectorizeMatch))
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);
    return { count: matches.length, matches };
  }

  async upsert(vectors: VectorizeVector[]): Promise<VectorizeMutation> {
    for (const vector of vectors) {
      this.vectors.set(vector.id, vector);
    }
    return { mutationId: `mut-${this.vectors.size}` };
  }

  async deleteByIds(ids: string[]): Promise<VectorizeMutation> {
    const namespaces = new Set(ids.map((id) => this.vectors.get(id)?.namespace).filter(Boolean));
    if (namespaces.size > 1) {
      throw new Error('FakeVectorize deleteByIds expected a single namespace');
    }
    for (const id of ids) {
      this.vectors.delete(id);
    }
    return { mutationId: `del-${ids.length}` };
  }

  async getByIds(ids: string[]): Promise<VectorizeVector[]> {
    return ids.map((id) => this.vectors.get(id)).filter(Boolean) as VectorizeVector[];
  }
}

function embed(text: string): number[] {
  const output = Array.from({ length: 384 }, () => 0);
  for (let index = 0; index < text.length; index += 1) {
    output[index % 384]! += text.charCodeAt(index) / 255;
  }
  return normalizeVector(output);
}

function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / magnitude);
}

function cosine(left: number[], right: number[]): number {
  let sum = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    sum += left[index]! * right[index]!;
  }
  return sum;
}

function matchesFilter(metadata: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, value]) => metadata[key] === value);
}

export function createBaseEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    DB: new FakeD1Database(),
    MEMORY_BUCKET: new FakeR2Bucket(),
    AI: new FakeAI(),
    VECTORIZE: new FakeVectorize(),
    OAUTH_ISSUER: 'https://memory.example.com',
    MCP_RESOURCE: 'https://memory.example.com/mcp',
    MCP_AUDIENCE: 'https://memory.example.com/mcp',
    EMBEDDING_MODEL: '@cf/baai/bge-small-en-v1.5',
    EMBEDDING_DIMENSIONS: '384',
    VECTORIZE_INDEX_NAME: 'memheaven-memory',
    PLAN_MODE: 'free',
    SEARCH_DEFAULT_LIMIT: '5',
    SEARCH_MAX_LIMIT: '10',
    DRAWER_MAX_CHARS: '64000',
    DRAWER_DEFAULT_MAX_CHARS: '16000',
    SEARCH_RESULT_MAX_CHARS: '4000',
    DAILY_MAX_MCP_CALLS_PER_TENANT: '2000',
    DAILY_MAX_WRITES_PER_TENANT: '100',
    DAILY_MAX_VECTOR_QUERIES_PER_TENANT: '500',
    DAILY_MAX_EMBEDDING_INPUT_CHARS_PER_TENANT: '500000',
    JWT_SIGNING_SECRET: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY',
    TOKEN_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY',
    AUTH_KEY_PEPPER: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY',
    ACCESS_KEYS_JSON: '[]',
    ...overrides,
  };
}
