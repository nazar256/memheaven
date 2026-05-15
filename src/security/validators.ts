import type { AppConfig } from '../config';
import { sha256Base64Url } from './crypto';

const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const EXACT_HTTPS_REDIRECT_URIS = new Set([
  'https://chatgpt.com/connector_platform_oauth_redirect',
  'https://claude.ai/api/mcp/auth_callback',
  'https://vscode.dev/redirect',
]);
const CHATGPT_CONNECTOR_REDIRECT_PATH = /^\/connector\/oauth\/[A-Za-z0-9_-]+$/;

export function sanitizeSimpleText(value: string, label: string, maxLength = 80): string {
  const sanitized = value.trim().replace(/\s+/g, ' ');
  if (!sanitized) {
    throw new Error(`${label} is required`);
  }
  if (sanitized.length > maxLength) {
    throw new Error(`${label} exceeds maximum length ${maxLength}`);
  }
  if (containsControlCharacters(sanitized)) {
    throw new Error(`${label} contains control characters`);
  }
  return sanitized;
}

export function sanitizePathLike(value: string | undefined, label: string, maxLength = 200): string | undefined {
  if (!value) {
    return undefined;
  }
  const sanitized = value.trim();
  if (!sanitized) {
    return undefined;
  }
  if (sanitized.length > maxLength) {
    throw new Error(`${label} exceeds maximum length ${maxLength}`);
  }
  if (containsControlCharacters(sanitized)) {
    throw new Error(`${label} contains control characters`);
  }
  return sanitized;
}

function containsControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if ((codePoint >= 0 && codePoint <= 31) || codePoint === 127) {
      return true;
    }
  }
  return false;
}

export function canonicalizeRedirectUri(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Redirect URI must use https or localhost http');
  }
  url.hash = '';
  return url.toString();
}

export function isAllowedRedirectUri(value: string): boolean {
  const url = new URL(value);
  if (url.protocol === 'https:') {
    if (EXACT_HTTPS_REDIRECT_URIS.has(url.toString())) {
      return true;
    }
    if (
      url.origin === 'https://chatgpt.com'
      && !url.search
      && CHATGPT_CONNECTOR_REDIRECT_PATH.test(url.pathname)
    ) {
      return true;
    }
    return false;
  }

  if (url.protocol === 'http:' && LOCALHOST_HOSTS.has(url.hostname)) {
    return true;
  }

  return false;
}

export async function deriveClientId(issuer: string, redirectUri: string): Promise<string> {
  const hash = await sha256Base64Url(`${issuer}|${redirectUri}`);
  return `mcp_${hash.slice(0, 32)}`;
}

export async function validateClientIdentity(
  config: AppConfig,
  clientId: string,
  redirectUri: string,
): Promise<void> {
  const canonical = canonicalizeRedirectUri(redirectUri);
  if (!isAllowedRedirectUri(canonical)) {
    throw new Error('Redirect URI is not allowed');
  }
  const expectedClientId = await deriveClientId(config.issuer, canonical);
  if (clientId !== expectedClientId) {
    throw new Error('Client ID does not match redirect URI');
  }
}

export function parseBearerToken(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/iu.exec(header.trim());
  return match?.[1] ?? null;
}

export function validateTokenDurationDays(rawValue: string | null | undefined, maxDays: number): number {
  if (!rawValue) {
    return 365;
  }
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value <= 0 || value > maxDays) {
    throw new Error(`Token duration must be between 1 and ${maxDays} days`);
  }
  return value;
}
