import { randomBase64Url } from '../src/utils/ids';
import { fileURLToPath } from 'node:url';

interface GeneratedSecrets {
  JWT_SIGNING_SECRET: string;
  TOKEN_ENCRYPTION_KEY: string;
  AUTH_KEY_PEPPER: string;
}

export function generateSecrets(): GeneratedSecrets {
  return {
    JWT_SIGNING_SECRET: randomBase64Url(32),
    TOKEN_ENCRYPTION_KEY: randomBase64Url(32),
    AUTH_KEY_PEPPER: randomBase64Url(32),
  };
}

function main(): void {
  process.stdout.write(`${JSON.stringify(generateSecrets(), null, 2)}\n`);
}

function isMainModule(): boolean {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  main();
}
