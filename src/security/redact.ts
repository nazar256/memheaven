const SECRET_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'access_key',
  'accesskey',
  'raw_access_key',
  'code_verifier',
  'refresh_token',
  'access_token',
  'token',
]);

const LARGE_TEXT_KEYS = new Set(['content', 'entry']);

export function redactValue(key: string, value: unknown): unknown {
  const normalized = key.toLowerCase();
  if (SECRET_KEYS.has(normalized)) {
    return '[REDACTED]';
  }
  if (LARGE_TEXT_KEYS.has(normalized) && typeof value === 'string') {
    return `[REDACTED_TEXT length=${value.length}]`;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(key, item));
  }
  if (value && typeof value === 'object') {
    return redactObject(value as Record<string, unknown>);
  }
  return value;
}

export function redactObject(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, redactValue(key, value)]));
}

export function redactHeaders(headers: Headers): Record<string, string> {
  const output: Record<string, string> = {};
  headers.forEach((value, key) => {
    output[key] = SECRET_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : value;
  });
  return output;
}

export function redactErrorMessage(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gu, 'Bearer [REDACTED]')
    .replace(/access[_-]?key[^\s]*/giu, 'access_key=[REDACTED]');
}
