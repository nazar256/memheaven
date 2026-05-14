import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import type { AccessKeyRecord } from '../src/memory/types';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const DEFAULT_ACCESS_KEYS_FILE = '.tmp/access-keys.json';
const DEFAULT_SCOPES = ['memory.read', 'memory.write'];
const ACCESS_KEYS_SECRET_NAME = 'ACCESS_KEYS_JSON';

interface ParsedCliOptions {
  tenant: string;
  label: string;
  pepper: string;
  keyId: string | undefined;
  filePath: string;
  scopes: string[];
  sync: boolean;
}

interface CreateAccessKeyInput {
  tenant: string;
  label: string;
  pepper: string;
  keyId: string | undefined;
  scopes: string[];
  now?: Date;
}

interface CreatedAccessKey {
  rawKey: string;
  record: AccessKeyRecord;
}

export function defaultAccessKeysFile(cwd = process.cwd()): string {
  return resolve(cwd, DEFAULT_ACCESS_KEYS_FILE);
}

export function ensureFileIsInsideTmp(filePath: string, cwd = process.cwd()): string {
  const tmpRoot = resolve(cwd, '.tmp');
  const resolved = resolve(cwd, filePath);
  const rel = relative(tmpRoot, resolved);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    return resolved;
  }
  throw new Error(`Access key store must live inside ${tmpRoot}`);
}

export function parseScopes(raw: string | undefined): string[] {
  if (!raw) {
    return [...DEFAULT_SCOPES];
  }
  const scopes = raw
    .split(/[\s,]+/u)
    .map((value) => value.trim())
    .filter(Boolean);

  if (scopes.length === 0) {
    throw new Error('At least one scope is required when --scopes is provided');
  }

  return Array.from(new Set(scopes));
}

export function parseAccessKeyStore(text: string): AccessKeyRecord[] {
  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('Access key store must be a JSON array');
  }

  return parsed.map((value, index) => parseAccessKeyRecord(value, index));
}

export function mergeAccessKeyRecords(existing: AccessKeyRecord[], next: AccessKeyRecord): AccessKeyRecord[] {
  if (existing.some((record) => record.id === next.id)) {
    throw new Error(`Access key id already exists in local store: ${next.id}`);
  }
  if (existing.some((record) => record.hash === next.hash)) {
    throw new Error('Access key hash already exists in local store');
  }
  return [...existing, next];
}

export async function createAccessKey(input: CreateAccessKeyInput): Promise<CreatedAccessKey> {
  const rawKey = randomBase64Url(32);
  const dateStamp = (input.now ?? new Date()).toISOString().slice(0, 10);
  const keyId = input.keyId?.trim() || `${input.tenant}-${dateStamp}-${randomBase64Url(6).slice(0, 8)}`;
  const hash = await hmacSha256Base64Url(decodeBase64Flexible(input.pepper), rawKey);

  return {
    rawKey,
    record: {
      id: keyId,
      tenant_id: input.tenant,
      label: input.label,
      hash,
      scopes: [...input.scopes],
      active: true,
    },
  };
}

export function loadAccessKeyStore(filePath: string): AccessKeyRecord[] {
  if (!existsSync(filePath)) {
    return [];
  }
  return parseAccessKeyStore(readFileSync(filePath, 'utf8'));
}

export function writeAccessKeyStore(filePath: string, records: AccessKeyRecord[]): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
}

export function syncAccessKeysSecret(records: AccessKeyRecord[]): void {
  const result = spawnSync('npx', ['wrangler', 'secret', 'put', ACCESS_KEYS_SECRET_NAME], {
    input: JSON.stringify(records),
    stdio: ['pipe', 'inherit', 'inherit'],
  });

  if (result.error) {
    throw new Error(`Failed to run Wrangler: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Wrangler secret put ${ACCESS_KEYS_SECRET_NAME} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

function parseCliOptions(argv = process.argv.slice(2), cwd = process.cwd()): ParsedCliOptions {
  const { values } = parseArgs({
    args: argv,
    allowNegative: true,
    options: {
      tenant: { type: 'string' },
      label: { type: 'string' },
      pepper: { type: 'string' },
      id: { type: 'string' },
      file: { type: 'string' },
      scopes: { type: 'string' },
      sync: { type: 'boolean', default: true },
    },
  });

  const tenant = values.tenant?.trim();
  const label = values.label?.trim();
  const pepper = values.pepper ?? process.env.AUTH_KEY_PEPPER;

  if (!tenant || !label) {
    throw new Error('Usage: npm run keygen -- --tenant <tenant_id> --label <label> [--id <key_id>] [--scopes scope1,scope2] [--file .tmp/access-keys.json] [--no-sync] [--pepper <AUTH_KEY_PEPPER>]');
  }
  if (!pepper) {
    throw new Error('AUTH_KEY_PEPPER is required via --pepper or environment');
  }

  return {
    tenant,
    label,
    pepper,
    keyId: values.id?.trim() || undefined,
    filePath: ensureFileIsInsideTmp(values.file ?? defaultAccessKeysFile(cwd), cwd),
    scopes: parseScopes(values.scopes),
    sync: values.sync,
  };
}

async function main() {
  const options = parseCliOptions();
  const existingRecords = loadAccessKeyStore(options.filePath);
  const created = await createAccessKey({
    tenant: options.tenant,
    label: options.label,
    pepper: options.pepper,
    keyId: options.keyId,
    scopes: options.scopes,
  });

  const mergedRecords = mergeAccessKeyRecords(existingRecords, created.record);
  writeAccessKeyStore(options.filePath, mergedRecords);

  if (options.sync) {
    syncAccessKeysSecret(mergedRecords);
  }

  const fileDisplayPath = relative(process.cwd(), options.filePath) || options.filePath;
  process.stdout.write(`${JSON.stringify({
    raw_key: created.rawKey,
    access_key_record: created.record,
    access_keys_file: fileDisplayPath,
    access_keys_count: mergedRecords.length,
    cloudflare_secret: ACCESS_KEYS_SECRET_NAME,
    synced_to_cloudflare: options.sync,
    note: 'The local access key store contains only hashed records. Save the raw key somewhere safe now; it is not written to disk.',
  }, null, 2)}\n`);
}

function parseAccessKeyRecord(value: unknown, index: number): AccessKeyRecord {
  if (!value || typeof value !== 'object') {
    throw new Error(`Access key store entry ${index} must be an object`);
  }

  const record = value as Partial<AccessKeyRecord>;
  if (typeof record.id !== 'string' || !record.id.trim()) {
    throw new Error(`Access key store entry ${index} is missing a valid id`);
  }
  if (typeof record.tenant_id !== 'string' || !record.tenant_id.trim()) {
    throw new Error(`Access key store entry ${index} is missing a valid tenant_id`);
  }
  if (typeof record.label !== 'string' || !record.label.trim()) {
    throw new Error(`Access key store entry ${index} is missing a valid label`);
  }
  if (typeof record.hash !== 'string' || !record.hash.trim()) {
    throw new Error(`Access key store entry ${index} is missing a valid hash`);
  }
  if (!Array.isArray(record.scopes) || record.scopes.some((scope) => typeof scope !== 'string' || !scope.trim())) {
    throw new Error(`Access key store entry ${index} has invalid scopes`);
  }
  if (typeof record.active !== 'boolean') {
    throw new Error(`Access key store entry ${index} has invalid active flag`);
  }

  return {
    id: record.id,
    tenant_id: record.tenant_id,
    label: record.label,
    hash: record.hash,
    scopes: [...record.scopes],
    active: record.active,
  };
}

function randomBase64Url(size: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return Buffer.from(bytes).toString('base64url');
}

function decodeBase64Flexible(value: string): Uint8Array {
  try {
    return Uint8Array.from(Buffer.from(value, 'base64url'));
  } catch {
    try {
      return Uint8Array.from(Buffer.from(value, 'base64'));
    } catch {
      return new TextEncoder().encode(value);
    }
  }
}

async function hmacSha256Base64Url(secret: Uint8Array, data: string): Promise<string> {
  const raw = secret.buffer.slice(secret.byteOffset, secret.byteOffset + secret.byteLength) as ArrayBuffer;
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return Buffer.from(new Uint8Array(signature)).toString('base64url');
}

function isMainModule(): boolean {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
