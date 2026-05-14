import type { AppEnv } from '../../src/config';
import { requireConfig } from '../../src/config';
import { hashAccessKey } from '../../src/security/accessKeys';
import { issueAuthorizationCode, verifyAccessToken } from '../../src/oauth/token';
import { createBaseEnv } from './fakes';

export const RAW_KEY_A = 'tenant-a-secret';
export const RAW_KEY_B = 'tenant-b-secret';

interface KeyOverrides {
  scopes?: string[];
  active?: boolean;
  id?: string;
  label?: string;
}

export async function createEnvWithKeys(options?: {
  tenantA?: KeyOverrides;
  tenantB?: KeyOverrides;
  extraKeys?: Array<{
    rawKey: string;
    id: string;
    tenant_id: string;
    label: string;
    scopes: string[];
    active: boolean;
  }>;
}): Promise<AppEnv> {
  const base = createBaseEnv();
  const partialConfig = requireConfig({ ...base, ACCESS_KEYS_JSON: '[]' });
  const keyA = {
    id: options?.tenantA?.id ?? 'tenant-a-key',
    tenant_id: 'tenant-a',
    label: options?.tenantA?.label ?? 'Tenant A',
    hash: await hashAccessKey(RAW_KEY_A, partialConfig.authKeyPepperBytes),
    scopes: options?.tenantA?.scopes ?? ['memory.read', 'memory.write'],
    active: options?.tenantA?.active ?? true,
  };
  const keyB = {
    id: options?.tenantB?.id ?? 'tenant-b-key',
    tenant_id: 'tenant-b',
    label: options?.tenantB?.label ?? 'Tenant B',
    hash: await hashAccessKey(RAW_KEY_B, partialConfig.authKeyPepperBytes),
    scopes: options?.tenantB?.scopes ?? ['memory.read', 'memory.write'],
    active: options?.tenantB?.active ?? true,
  };
  const extraKeys = await Promise.all(
    (options?.extraKeys ?? []).map(async (record) => ({
      ...record,
      hash: await hashAccessKey(record.rawKey, partialConfig.authKeyPepperBytes),
    })),
  );
  return {
    ...base,
    ACCESS_KEYS_JSON: JSON.stringify([keyA, keyB, ...extraKeys]),
  };
}

export async function issueAccessTokenFor(env: AppEnv, tenantId: 'tenant-a' | 'tenant-b'): Promise<string> {
  const config = requireConfig(env);
  const key = config.accessKeys.find((item) => item.tenant_id === tenantId);
  if (!key) {
    throw new Error(`Missing key for ${tenantId}`);
  }
  const code = await issueAuthorizationCode(config, {
    clientId: 'mcp_test_client',
    redirectUri: 'https://chatgpt.com/connector_platform_oauth_redirect',
    codeChallenge: 'challenge',
    scopes: ['memory.read', 'memory.write'],
    tenantId,
    keyId: key.id,
    keyLabel: key.label,
    durationDays: 30,
    resource: config.mcpResource,
    subject: `subject:${tenantId}`,
  });
  const verifier = 'plain';
  return code + '::' + verifier;
}

export async function mintDirectAccessToken(env: AppEnv, tenantId: 'tenant-a' | 'tenant-b'): Promise<string> {
  const config = requireConfig(env);
  const key = config.accessKeys.find((item) => item.tenant_id === tenantId);
  if (!key) {
    throw new Error(`Missing key for ${tenantId}`);
  }
  const { signJwt } = await import('../../src/security/jwt');
  const issuedAt = Math.floor(Date.now() / 1000);
  return signJwt(config.jwtSigningKeyBytes, 'access-token+jwt', {
    iss: config.issuer,
    aud: config.mcpAudience,
    iat: issuedAt,
    exp: issuedAt + 3600,
    jti: `${tenantId}-token`,
    type: 'access_token',
    client_id: 'mcp_test_client',
    key_id: key.id,
    key_label: key.label,
    tenant_id: tenantId,
    scope: 'memory.read memory.write',
    sub: `subject:${tenantId}`,
  });
}

export async function verifyDirectAccessToken(env: AppEnv, token: string) {
  return verifyAccessToken(requireConfig(env), token);
}

export async function mintCustomAccessToken(
  env: AppEnv,
  input: {
    tenantId: string;
    keyId: string;
    keyLabel: string;
    scopes: string[];
    clientId?: string;
  },
): Promise<string> {
  const config = requireConfig(env);
  const { signJwt } = await import('../../src/security/jwt');
  const issuedAt = Math.floor(Date.now() / 1000);
  return signJwt(config.jwtSigningKeyBytes, 'access-token+jwt', {
    iss: config.issuer,
    aud: config.mcpAudience,
    iat: issuedAt,
    exp: issuedAt + 3600,
    jti: `${input.tenantId}-${input.keyId}-token`,
    type: 'access_token',
    client_id: input.clientId ?? 'mcp_test_client',
    key_id: input.keyId,
    key_label: input.keyLabel,
    tenant_id: input.tenantId,
    scope: input.scopes.join(' '),
    sub: `subject:${input.tenantId}:${input.keyId}`,
  });
}
