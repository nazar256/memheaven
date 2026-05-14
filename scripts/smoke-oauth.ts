import { parseArgs } from 'node:util';

async function main() {
  const { values } = parseArgs({
    options: {
      base: { type: 'string' },
    },
  });
  const base = values.base?.replace(/\/$/u, '');
  if (!base) {
    throw new Error('Usage: npm run smoke:oauth -- --base https://your-domain.example');
  }

  const authServer = await fetchJson(`${base}/.well-known/oauth-authorization-server`);
  const protectedResource = await fetchJson(`${base}/.well-known/oauth-protected-resource/mcp`);

  process.stdout.write(`${JSON.stringify({ authorization_server: authServer, protected_resource: protectedResource }, null, 2)}\n`);
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  const text = await response.text();
  return {
    url,
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
