import { describe, expect, it } from 'vitest';

import { requireConfig } from '../src/config';
import { buildAuthorizationServerMetadata, buildProtectedResourceMetadata } from '../src/oauth/metadata';
import { createBaseEnv } from './helpers/fakes';

describe('oauth metadata', () => {
  it('returns authorization server metadata', () => {
    const config = requireConfig(createBaseEnv());
    const metadata = buildAuthorizationServerMetadata(config);
    expect(metadata.issuer).toBe(config.issuer);
    expect(metadata.code_challenge_methods_supported).toContain('S256');
    expect(metadata.registration_endpoint).toContain('/register');
  });

  it('returns protected resource metadata', () => {
    const config = requireConfig(createBaseEnv());
    const metadata = buildProtectedResourceMetadata(config);
    expect(metadata.resource).toBe(config.mcpResource);
    expect(metadata.authorization_servers).toContain(config.issuer);
  });
});
