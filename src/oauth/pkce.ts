import { sha256Base64Url } from '../security/crypto';

export async function verifyPkceS256(codeVerifier: string, expectedChallenge: string): Promise<boolean> {
  const actual = await sha256Base64Url(codeVerifier);
  return actual === expectedChallenge;
}

export function validatePkceChallenge(method: string | null, challenge: string | null): void {
  if (method !== 'S256') {
    throw new Error('PKCE code_challenge_method must be S256');
  }
  if (!challenge) {
    throw new Error('Missing PKCE code_challenge');
  }
}
