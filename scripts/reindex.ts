import { parseArgs } from 'node:util';

interface JsonRpcResponse<T> {
  result?: {
    structuredContent?: T;
    content?: Array<{ type: string; text?: string }>;
  };
  error?: {
    code: number;
    message: string;
  };
}

interface DrawerSummary {
  drawer_id: string;
  wing: string;
  room: string;
  title?: string | null;
}

interface ListDrawersResult {
  drawers: DrawerSummary[];
  total: number;
  count: number;
  offset: number;
  limit: number;
}

interface UpdateDrawerResult {
  success: boolean;
  drawer_id: string;
  updated_fields: string[];
}

async function main() {
  const { values } = parseArgs({
    options: {
      base: { type: 'string' },
      token: { type: 'string' },
      drawer: { type: 'string' },
      wing: { type: 'string' },
      room: { type: 'string' },
      limit: { type: 'string' },
      'dry-run': { type: 'boolean' },
    },
  });

  const base = values.base?.replace(/\/$/u, '');
  const token = values.token;
  if (!base || !token) {
    throw new Error('Usage: npm run reindex -- --base https://your-domain.example --token <bearer> [--drawer <id>] [--wing <wing>] [--room <room>] [--limit <1-100>] [--dry-run]');
  }

  const pageLimit = clampLimit(values.limit);
  const targetedDrawers = values.drawer
    ? [{ drawer_id: values.drawer, wing: values.wing ?? 'unknown', room: values.room ?? 'unknown' } satisfies DrawerSummary]
    : await listAllDrawers(base, token, {
        ...(values.wing ? { wing: values.wing } : {}),
        ...(values.room ? { room: values.room } : {}),
        limit: pageLimit,
      });

  if (values['dry-run']) {
    process.stdout.write(`${JSON.stringify({ dry_run: true, count: targetedDrawers.length, drawers: targetedDrawers }, null, 2)}\n`);
    return;
  }

  const results: Array<{ drawer_id: string; success: boolean; updated_fields?: string[]; error?: string }> = [];
  for (const drawer of targetedDrawers) {
    try {
      const updated = await callTool<UpdateDrawerResult>(base, token, 'mempalace_update_drawer', {
        drawer_id: drawer.drawer_id,
        force_reindex: true,
      });
      results.push({ drawer_id: drawer.drawer_id, success: updated.success, updated_fields: updated.updated_fields });
    } catch (error) {
      results.push({
        drawer_id: drawer.drawer_id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  process.stdout.write(`${JSON.stringify({ count: targetedDrawers.length, reindexed: results.filter((item) => item.success).length, failed: results.filter((item) => !item.success).length, results }, null, 2)}\n`);
}

function clampLimit(value: string | undefined): number {
  const parsed = Number(value ?? '50');
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error('limit must be an integer between 1 and 100');
  }
  return parsed;
}

async function listAllDrawers(
  base: string,
  token: string,
  filters: { wing?: string; room?: string; limit: number },
): Promise<DrawerSummary[]> {
  const drawers: DrawerSummary[] = [];
  let offset = 0;

  while (true) {
    const page = await callTool<ListDrawersResult>(base, token, 'mempalace_list_drawers', {
      wing: filters.wing,
      room: filters.room,
      limit: filters.limit,
      offset,
    });
    drawers.push(...page.drawers);
    if (page.count === 0 || drawers.length >= page.total) {
      break;
    }
    offset += page.count;
  }

  return drawers;
}

async function callTool<T>(base: string, token: string, name: string, args: Record<string, unknown>): Promise<T> {
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
      id: `reindex-${name}`,
      method: 'tools/call',
      params: {
        name,
        arguments: args,
      },
    }),
  });

  const body = await response.json() as JsonRpcResponse<T>;
  if (!response.ok) {
    throw new Error(JSON.stringify(body));
  }
  if (body.error) {
    throw new Error(body.error.message);
  }
  if (body.result?.structuredContent) {
    return body.result.structuredContent;
  }
  const textContent = body.result?.content?.find((item) => item.type === 'text')?.text;
  if (textContent) {
    return JSON.parse(textContent) as T;
  }
  throw new Error(`Tool ${name} returned no structured content`);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
