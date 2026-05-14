import { describe, expect, it } from 'vitest';

import { decodeBase64Flexible } from '../src/utils/ids';
import { generateSecrets } from '../scripts/generate-secrets';

describe('secret generation script', () => {
  it('generates all required secrets with valid lengths', () => {
    const secrets = generateSecrets();

    expect(Object.keys(secrets)).toEqual([
      'JWT_SIGNING_SECRET',
      'TOKEN_ENCRYPTION_KEY',
      'AUTH_KEY_PEPPER',
    ]);

    expect(decodeBase64Flexible(secrets.JWT_SIGNING_SECRET)).toHaveLength(32);
    expect(decodeBase64Flexible(secrets.TOKEN_ENCRYPTION_KEY)).toHaveLength(32);
    expect(decodeBase64Flexible(secrets.AUTH_KEY_PEPPER)).toHaveLength(32);
  });
});
