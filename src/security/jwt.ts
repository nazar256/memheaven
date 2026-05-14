import { base64UrlToBytes, bytesToBase64Url, hmacSha256, aesGcmEncrypt, aesGcmDecrypt } from './crypto';

export interface JwtHeader {
  alg: 'HS256';
  typ: string;
}

export interface JwtPayload {
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
  type: string;
  [key: string]: unknown;
}

export interface VerifyJwtOptions {
  issuer: string;
  audience: string;
  type: string;
  now?: Date;
}

type StandardJwtClaims = Pick<JwtPayload, 'iss' | 'aud' | 'iat' | 'exp' | 'jti' | 'type'>;

export async function signJwt(
  secret: Uint8Array,
  typ: string,
  payload: JwtPayload,
): Promise<string> {
  const header: JwtHeader = { alg: 'HS256', typ };
  const encodedHeader = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await hmacSha256(secret, signingInput);
  return `${signingInput}.${bytesToBase64Url(signature)}`;
}

export async function verifyJwt<T extends StandardJwtClaims>(
  secret: Uint8Array,
  token: string,
  options: VerifyJwtOptions,
): Promise<T> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  const encodedHeader = parts[0]!;
  const encodedPayload = parts[1]!;
  const encodedSignature = parts[2]!;
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = await hmacSha256(secret, signingInput);
  const actualSignature = base64UrlToBytes(encodedSignature);
  if (expectedSignature.length !== actualSignature.length) {
    throw new Error('Invalid JWT signature');
  }
  let diff = 0;
  for (let index = 0; index < expectedSignature.length; index += 1) {
    const left = expectedSignature[index]!;
    const right = actualSignature[index]!;
    diff |= left ^ right;
  }
  if (diff !== 0) {
    throw new Error('Invalid JWT signature');
  }

  const header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encodedHeader))) as JwtHeader;
  if (header.alg !== 'HS256') {
    throw new Error('Unsupported JWT algorithm');
  }

  const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encodedPayload))) as T;
  const now = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (payload.iss !== options.issuer) {
    throw new Error('Invalid JWT issuer');
  }
  if (payload.aud !== options.audience) {
    throw new Error('Invalid JWT audience');
  }
  if (payload.type !== options.type) {
    throw new Error('Invalid JWT type');
  }
  if (payload.exp <= now) {
    throw new Error('JWT expired');
  }
  if (payload.iat > now + 60) {
    throw new Error('JWT issued in the future');
  }
  return payload;
}

export async function encryptJwtConfig(
  secret: Uint8Array,
  claims: Pick<JwtPayload, 'iss' | 'aud' | 'exp' | 'jti' | 'type'>,
  value: unknown,
): Promise<string> {
  const aad = `${claims.iss}|${claims.aud}|${claims.exp}|${claims.jti}|${claims.type}`;
  return aesGcmEncrypt(secret, JSON.stringify(value), aad);
}

export async function decryptJwtConfig<T>(
  secret: Uint8Array,
  claims: Pick<JwtPayload, 'iss' | 'aud' | 'exp' | 'jti' | 'type'>,
  value: string,
): Promise<T> {
  const aad = `${claims.iss}|${claims.aud}|${claims.exp}|${claims.jti}|${claims.type}`;
  return JSON.parse(await aesGcmDecrypt(secret, value, aad)) as T;
}
