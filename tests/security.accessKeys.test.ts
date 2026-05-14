import { describe, expect, it } from 'vitest';

import { requireConfig } from '../src/config';
import { findAccessKeyRecord, hashAccessKey } from '../src/security/accessKeys';
import { redactHeaders, redactObject } from '../src/security/redact';
import { createEnvWithKeys, RAW_KEY_A } from './helpers/testData';

describe('access keys and redaction', async () => {
  it('hashes and finds active access keys', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const hash = await hashAccessKey(RAW_KEY_A, config.authKeyPepperBytes);
    expect(hash).toBe(config.accessKeys[0]?.hash);
    const record = await findAccessKeyRecord(config, RAW_KEY_A);
    expect(record?.tenant_id).toBe('tenant-a');
  });

  it('redacts secrets from objects and headers', () => {
    const redacted = redactObject({ access_key: 'secret', content: 'full body', ok: true });
    expect(redacted.access_key).toBe('[REDACTED]');
    expect(redacted.content).toBe('[REDACTED_TEXT length=9]');

    const headers = new Headers({ authorization: 'Bearer abc', 'x-test': 'ok' });
    const redactedHeaders = redactHeaders(headers);
    expect(redactedHeaders.authorization).toBe('[REDACTED]');
    expect(redactedHeaders['x-test']).toBe('ok');
  });
});
