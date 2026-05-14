import { base64UrlDecode, base64UrlEncode } from '../utils/ids';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function asBufferSource(bytes: Uint8Array): ArrayBuffer {
  return asArrayBuffer(bytes);
}

export function utf8(input: string): Uint8Array {
  return encoder.encode(input);
}

export function decodeUtf8(input: Uint8Array): string {
  return decoder.decode(input);
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return base64UrlEncode(bytes);
}

export function base64UrlToBytes(value: string): Uint8Array {
  return base64UrlDecode(value);
}

export async function importHmacKey(secret: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', asBufferSource(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function importAesKey(secret: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', asBufferSource(secret), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function hmacSha256(secret: Uint8Array, data: string): Promise<Uint8Array> {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, asBufferSource(utf8(data)));
  return new Uint8Array(signature);
}

export async function hmacSha256Base64Url(secret: Uint8Array, data: string): Promise<string> {
  return bytesToBase64Url(await hmacSha256(secret, data));
}

export function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
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

export async function aesGcmEncrypt(
  secret: Uint8Array,
  plaintext: string,
  additionalData?: string,
): Promise<string> {
  const key = await importAesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const params: AesGcmParams = {
    name: 'AES-GCM',
    iv,
  };
  if (additionalData) {
    params.additionalData = asBufferSource(utf8(additionalData));
  }
  const encrypted = await crypto.subtle.encrypt(
    params,
    key,
    asBufferSource(utf8(plaintext)),
  );
  return bytesToBase64Url(concatBytes([iv, new Uint8Array(encrypted)]));
}

export async function aesGcmDecrypt(
  secret: Uint8Array,
  payload: string,
  additionalData?: string,
): Promise<string> {
  const key = await importAesKey(secret);
  const bytes = base64UrlToBytes(payload);
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  const params: AesGcmParams = {
    name: 'AES-GCM',
    iv,
  };
  if (additionalData) {
    params.additionalData = asBufferSource(utf8(additionalData));
  }
  const decrypted = await crypto.subtle.decrypt(
    params,
    key,
    asBufferSource(ciphertext),
  );
  return decodeUtf8(new Uint8Array(decrypted));
}

export async function sha256Base64Url(data: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', asBufferSource(utf8(data)));
  return bytesToBase64Url(new Uint8Array(digest));
}
