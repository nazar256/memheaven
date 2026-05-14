import { describe, expect, it } from 'vitest';

import {
  createAccessKey,
  defaultAccessKeysFile,
  ensureFileIsInsideTmp,
  mergeAccessKeyRecords,
  parseAccessKeyStore,
  parseScopes,
} from '../scripts/generate-access-key';

describe('keygen script helpers', () => {
  it('defaults the local access key store into .tmp', () => {
    expect(defaultAccessKeysFile('/repo')).toBe('/repo/.tmp/access-keys.json');
    expect(ensureFileIsInsideTmp('.tmp/access-keys.json', '/repo')).toBe('/repo/.tmp/access-keys.json');
  });

  it('rejects access key stores outside .tmp', () => {
    expect(() => ensureFileIsInsideTmp('access-keys.json', '/repo')).toThrow('must live inside');
  });

  it('creates hashed records and keeps raw keys out of the persisted store', async () => {
    const created = await createAccessKey({
      tenant: 'yura',
      label: 'Yura main',
      pepper: 'cGVwcGVyLXZhbHVlLXRlc3Q=',
      keyId: 'yura-main',
      scopes: ['memory.read', 'memory.write'],
      now: new Date('2026-05-14T00:00:00.000Z'),
    });

    const merged = mergeAccessKeyRecords([], created.record);
    const serialized = JSON.stringify(merged);

    expect(created.rawKey).toBeTruthy();
    expect(created.record.id).toBe('yura-main');
    expect(created.record.hash).not.toBe(created.rawKey);
    expect(serialized).not.toContain(created.rawKey);
    expect(parseAccessKeyStore(serialized)).toEqual(merged);
  });

  it('rejects duplicate ids and hashes in the local store', () => {
    const existing = [{
      id: 'tenant-a-key',
      tenant_id: 'tenant-a',
      label: 'Tenant A',
      hash: 'hash-a',
      scopes: ['memory.read'],
      active: true,
    }];

    expect(() => mergeAccessKeyRecords(existing, {
      id: 'tenant-a-key',
      tenant_id: 'tenant-b',
      label: 'Tenant B',
      hash: 'hash-b',
      scopes: ['memory.read'],
      active: true,
    })).toThrow('id already exists');

    expect(() => mergeAccessKeyRecords(existing, {
      id: 'tenant-b-key',
      tenant_id: 'tenant-b',
      label: 'Tenant B',
      hash: 'hash-a',
      scopes: ['memory.read'],
      active: true,
    })).toThrow('hash already exists');
  });

  it('parses scopes from comma or whitespace separated input', () => {
    expect(parseScopes(undefined)).toEqual(['memory.read', 'memory.write']);
    expect(parseScopes('memory.read,memory.write')).toEqual(['memory.read', 'memory.write']);
    expect(parseScopes('memory.read memory.write memory.read')).toEqual(['memory.read', 'memory.write']);
  });
});
