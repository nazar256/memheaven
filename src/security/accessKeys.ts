import type { AccessKeyRecord } from '../memory/types';
import type { AppConfig } from '../config';
import { base64UrlToBytes, hmacSha256Base64Url } from './crypto';

export interface ActiveAccessKeyResolution {
  record: AccessKeyRecord;
  scopes: string[];
}

export async function hashAccessKey(rawAccessKey: string, pepperBytes: Uint8Array): Promise<string> {
  return hmacSha256Base64Url(pepperBytes, rawAccessKey);
}

export async function findAccessKeyRecord(
  config: AppConfig,
  rawAccessKey: string,
): Promise<AccessKeyRecord | null> {
  const candidateHash = await hashAccessKey(rawAccessKey, config.authKeyPepperBytes);
  const candidateBytes = base64UrlToBytes(candidateHash);

  for (const record of config.accessKeys) {
    const recordBytes = base64UrlToBytes(record.hash);
    if (record.active && constantTimeEqualBytes(candidateBytes, recordBytes)) {
      return record;
    }
  }
  return null;
}

export function getActiveAccessKeyById(config: AppConfig, keyId: string): AccessKeyRecord | null {
  const record = config.accessKeys.find((item) => item.id === keyId);
  if (!record || !record.active) {
    return null;
  }
  return record;
}

export function resolveActiveAccessKey(
  config: AppConfig,
  input: {
    keyId: string;
    tenantId: string;
    requestedScopes?: string[];
  },
): ActiveAccessKeyResolution {
  const matches = config.accessKeys.filter((item) => item.id === input.keyId && item.active);
  if (matches.length !== 1) {
    throw new Error('Access key is inactive');
  }

  const record = matches[0]!;
  if (record.tenant_id !== input.tenantId) {
    throw new Error('Access key does not belong to this tenant');
  }

  const requestedScopes = input.requestedScopes ?? record.scopes;
  const scopes = requestedScopes.filter((scope) => record.scopes.includes(scope));
  if (scopes.length === 0) {
    throw new Error('Access key no longer grants any requested scopes');
  }

  return { record, scopes };
}

function constantTimeEqualBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftByte = left[index]!;
    const rightByte = right[index]!;
    diff |= leftByte ^ rightByte;
  }
  return diff === 0;
}
