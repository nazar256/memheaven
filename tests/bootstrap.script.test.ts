import { describe, expect, it } from 'vitest';

import {
  extractResourceNames,
  patchPublicBaseUrl,
  parseD1ListOutput,
  parseR2BucketNames,
  parseVectorizeListOutput,
  patchD1DatabaseId,
  REQUIRED_METADATA_INDEXES,
} from '../scripts/bootstrap';

describe('bootstrap script helpers', () => {
  it('extracts resource names from wrangler config', () => {
    const config = `name = "memheaven"

[[d1_databases]]
binding = "DB"
database_name = "memheaven_memory"
database_id = "old-id"

[[r2_buckets]]
binding = "MEMORY_BUCKET"
bucket_name = "memheaven-memory"

[[vectorize]]
binding = "VECTORIZE"
index_name = "memheaven-memory"

[vars]
EMBEDDING_DIMENSIONS = "384"
`;

    expect(extractResourceNames(config)).toEqual({
      workerName: 'memheaven',
      d1DatabaseName: 'memheaven_memory',
      r2BucketName: 'memheaven-memory',
      vectorizeIndexName: 'memheaven-memory',
      embeddingDimensions: 384,
    });
  });

  it('patches only the matching d1 database_id', () => {
    const config = `name = "memheaven"

[[d1_databases]]
binding = "DB"
database_name = "memheaven_memory"
database_id = "old-id"

[[d1_databases]]
binding = "OTHER"
database_name = "other"
database_id = "leave-me"
`;

    const updated = patchD1DatabaseId(config, 'memheaven_memory', 'new-id');
    expect(updated).toContain('database_id = "new-id"');
    expect(updated).toContain('database_id = "leave-me"');
  });

  it('inserts a missing d1 database_id line', () => {
    const config = `[[d1_databases]]
binding = "DB"
database_name = "memheaven_memory"

[vars]
PLAN_MODE = "free"
`;

    const updated = patchD1DatabaseId(config, 'memheaven_memory', 'inserted-id');
    expect(updated).toContain('database_name = "memheaven_memory"\ndatabase_id = "inserted-id"');
  });

  it('rejects ambiguous d1 matches', () => {
    const config = `[[d1_databases]]
database_name = "memheaven_memory"

[[d1_databases]]
database_name = "memheaven_memory"
`;

    expect(() => patchD1DatabaseId(config, 'memheaven_memory', 'new-id')).toThrow('Expected exactly one');
  });

  it('parses wrangler list outputs', () => {
    expect(parseD1ListOutput('[{"uuid":"abc","name":"memheaven_memory"}]')).toEqual([{ uuid: 'abc', name: 'memheaven_memory' }]);
    expect(parseR2BucketNames('Listing buckets...\nname:           memheaven-memory\ncreation_date:  2026-05-14T00:00:00.000Z\n')).toEqual(['memheaven-memory']);
    expect(parseVectorizeListOutput('📋 Listing Vectorize indexes...\n[{"name":"memheaven-memory","config":{"dimensions":384}}]')).toEqual([
      { name: 'memheaven-memory', config: { dimensions: 384 } },
    ]);
  });

  it('patches public OAuth/MCP base URL vars', () => {
    const config = `[vars]
OAUTH_ISSUER = "https://old.example.com"
MCP_RESOURCE = "https://old.example.com/mcp"
MCP_AUDIENCE = "https://old.example.com/mcp"
`;

    expect(patchPublicBaseUrl(config, 'https://memory.example.com/')).toBe(`[vars]
OAUTH_ISSUER = "https://memory.example.com"
MCP_RESOURCE = "https://memory.example.com/mcp"
MCP_AUDIENCE = "https://memory.example.com/mcp"
`);

    expect(() => patchPublicBaseUrl(config, 'https://memory.example.com/mcp')).toThrow('origin only');
  });

  it('includes every metadata filter used by drawer and diary Vectorize queries', () => {
    expect(REQUIRED_METADATA_INDEXES.map((index) => index.propertyName)).toEqual([
      'tenant_id',
      'wing',
      'room',
      'kind',
      'agent_name',
      'topic',
    ]);
  });
});
