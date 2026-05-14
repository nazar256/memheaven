import { describe, expect, it } from 'vitest';

import { getConfigDiagnostics } from '../src/config';
import { createBaseEnv } from './helpers/fakes';

describe('config diagnostics', () => {
  it('accepts a valid environment', () => {
    const diagnostics = getConfigDiagnostics(createBaseEnv());
    expect(diagnostics.ok).toBe(true);
    expect(diagnostics.errors).toEqual([]);
  });

  it('rejects invalid URLs and missing secrets clearly', () => {
    const env = createBaseEnv();
    delete env.JWT_SIGNING_SECRET;
    env.OAUTH_ISSUER = 'not-a-url';
    const diagnostics = getConfigDiagnostics(env);
    expect(diagnostics.ok).toBe(false);
    expect(diagnostics.errors.join(' ')).toContain('OAUTH_ISSUER');
  });

  it('reports missing bindings as warnings', () => {
    const env = createBaseEnv();
    delete env.DB;
    delete env.MEMORY_BUCKET;
    delete env.AI;
    delete env.VECTORIZE;
    const diagnostics = getConfigDiagnostics(env);
    expect(diagnostics.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(['missing_db', 'missing_r2', 'missing_ai', 'missing_vectorize']),
    );
  });

  it('rejects duplicate access key ids and hashes', () => {
    const env = createBaseEnv();
    env.ACCESS_KEYS_JSON = JSON.stringify([
      {
        id: 'dup-key',
        tenant_id: 'tenant-a',
        label: 'Tenant A',
        hash: 'same-hash',
        scopes: ['memory.read'],
        active: true,
      },
      {
        id: 'dup-key',
        tenant_id: 'tenant-b',
        label: 'Tenant B',
        hash: 'same-hash',
        scopes: ['memory.read'],
        active: true,
      },
    ]);

    const diagnostics = getConfigDiagnostics(env);
    expect(diagnostics.ok).toBe(false);
    expect(diagnostics.errors.join(' ')).toContain('duplicate key ids');
    expect(diagnostics.errors.join(' ')).toContain('duplicate key hashes');
  });
});
