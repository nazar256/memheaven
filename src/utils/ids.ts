import { stableStringify } from './json';

const textEncoder = new TextEncoder();

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value));
  return base64UrlEncode(new Uint8Array(digest));
}

export function base64UrlEncode(value: Uint8Array): string {
  const binary = String.fromCharCode(...value);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

export function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const binary = atob(`${normalized}${padding}`);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function decodeBase64Flexible(value: string): Uint8Array {
  const normalized = value.trim().replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  try {
    const binary = atob(`${normalized}${padding}`);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return textEncoder.encode(value);
  }
}

export function randomBase64Url(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return base64UrlEncode(buffer);
}

export async function deterministicId(prefix: string, components: unknown[]): Promise<string> {
  const hash = await sha256Base64Url(stableStringify(components));
  return `${prefix}_${hash.slice(0, 24)}`;
}

export async function shortHash(value: string, length = 12): Promise<string> {
  const hash = await sha256Base64Url(value);
  return hash.slice(0, length);
}

export function objectKeySegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}
