import { parseArgs } from 'node:util';

async function main() {
  const { values } = parseArgs({
    options: {
      base: { type: 'string' },
      token: { type: 'string' },
    },
  });

  const base = values.base?.replace(/\/$/u, '');
  const token = values.token ?? process.env.MEMHEAVEN_BEARER_TOKEN;
  if (!base || !token) {
    throw new Error('Usage: MEMHEAVEN_BEARER_TOKEN=<bearer-token> npm run smoke:mcp -- --base https://your-domain.example (or pass --token)');
  }

  const response = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-03-26',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'smoke-tools-list',
      method: 'tools/list',
      params: {},
    }),
  });

  const text = await response.text();
  process.stdout.write(`${JSON.stringify({ status: response.status, headers: headersObject(response.headers), body: safeJson(text) }, null, 2)}\n`);
}

function headersObject(headers: Headers): Record<string, string> {
  const output: Record<string, string> = {};
  headers.forEach((value, key) => {
    output[key] = value;
  });
  return output;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
