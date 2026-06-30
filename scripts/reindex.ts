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

interface DiaryReindexResult {
  success: boolean;
  dry_run: boolean;
  total: number;
  count: number;
  reindexed: number;
  failed: number;
  results: Array<{
    entry_id: string;
    agent: string;
    topic: string;
    wing: string;
    room: string;
    success: boolean;
    skipped?: boolean;
    chunks: number;
    error?: string;
  }>;
}

type ReindexKind = 'drawer' | 'diary' | 'all';

async function main() {
  const { values } = parseArgs({
    options: {
      base: { type: 'string' },
      token: { type: 'string' },
      kind: { type: 'string' },
      drawer: { type: 'string' },
      'diary-entry': { type: 'string' },
      agent: { type: 'string' },
      wing: { type: 'string' },
      room: { type: 'string' },
      topic: { type: 'string' },
      limit: { type: 'string' },
      'dry-run': { type: 'boolean' },
    },
  });

  const base = values.base?.replace(/\/$/u, '');
  const token = values.token ?? process.env.MEMHEAVEN_BEARER_TOKEN;
  const kind = parseKind(values.kind);
  if (!base || !token) {
    throw new Error('Usage: MEMHEAVEN_BEARER_TOKEN=<bearer> npm run reindex -- --base https://your-domain.example [--kind drawer|diary|all] [--drawer <id>] [--diary-entry <id>] [--agent <name>] [--wing <wing>] [--room <room>] [--topic <topic>] [--limit <1-100>] [--dry-run] (or pass --token)');
  }
  if (values.drawer && kind === 'diary') {
    throw new Error('--drawer can only be used with --kind drawer or --kind all');
  }
  if (values['diary-entry'] && kind === 'drawer') {
    throw new Error('--diary-entry can only be used with --kind diary or --kind all');
  }

  const pageLimit = clampLimit(values.limit);
  const dryRun = values['dry-run'] === true;
  const drawerSummary = kind === 'diary'
    ? null
    : await reindexDrawers(base, token, {
        ...(values.drawer ? { drawerId: values.drawer } : {}),
        ...(values.wing ? { wing: values.wing } : {}),
        ...(values.room ? { room: values.room } : {}),
        limit: pageLimit,
        dryRun,
      });
  const diarySummary = kind === 'drawer'
    ? null
    : await reindexDiaries(base, token, {
        ...(values['diary-entry'] ? { entryId: values['diary-entry'] } : {}),
        ...(values.agent ? { agentName: values.agent } : {}),
        ...(values.wing ? { wing: values.wing } : {}),
        ...(values.room ? { room: values.room } : {}),
        ...(values.topic ? { topic: values.topic } : {}),
        limit: pageLimit,
        dryRun,
      });

  const output = kind === 'drawer'
    ? drawerSummary
    : kind === 'diary'
      ? diarySummary
      : { kind: 'all', drawers: drawerSummary, diary: diarySummary };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

function parseKind(value: string | undefined): ReindexKind {
  if (value === undefined) {
    return 'drawer';
  }
  if (value === 'drawer' || value === 'diary' || value === 'all') {
    return value;
  }
  throw new Error('--kind must be one of: drawer, diary, all');
}

function clampLimit(value: string | undefined): number {
  const parsed = Number(value ?? '50');
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error('limit must be an integer between 1 and 100');
  }
  return parsed;
}

async function reindexDrawers(
  base: string,
  token: string,
  filters: { drawerId?: string; wing?: string; room?: string; limit: number; dryRun: boolean },
) {
  const targetedDrawers = filters.drawerId
    ? [{ drawer_id: filters.drawerId, wing: filters.wing ?? 'unknown', room: filters.room ?? 'unknown' } satisfies DrawerSummary]
    : await listAllDrawers(base, token, {
        ...(filters.wing ? { wing: filters.wing } : {}),
        ...(filters.room ? { room: filters.room } : {}),
        limit: filters.limit,
      });

  if (filters.dryRun) {
    return { kind: 'drawer', dry_run: true, count: targetedDrawers.length, drawers: targetedDrawers };
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

  return { kind: 'drawer', count: targetedDrawers.length, reindexed: results.filter((item) => item.success).length, failed: results.filter((item) => !item.success).length, results };
}

async function reindexDiaries(
  base: string,
  token: string,
  filters: { entryId?: string; agentName?: string; wing?: string; room?: string; topic?: string; limit: number; dryRun: boolean },
) {
  let offset = 0;
  let total = 0;
  let reindexed = 0;
  let failed = 0;
  const results: DiaryReindexResult['results'] = [];

  while (true) {
    const page = await callTool<DiaryReindexResult>(base, token, 'mempalace_diary_reindex', {
      ...(filters.entryId ? { entry_id: filters.entryId } : {}),
      ...(filters.agentName ? { agent_name: filters.agentName } : {}),
      ...(filters.wing ? { wing: filters.wing } : {}),
      ...(filters.room ? { room: filters.room } : {}),
      ...(filters.topic ? { topic: filters.topic } : {}),
      limit: filters.limit,
      offset,
      dry_run: filters.dryRun,
    });
    total = page.total;
    reindexed += page.reindexed;
    failed += page.failed;
    results.push(...page.results);
    if (page.count === 0 || results.length >= total || filters.entryId) {
      break;
    }
    offset += page.count;
  }

  return {
    kind: 'diary',
    dry_run: filters.dryRun,
    total,
    count: results.length,
    reindexed,
    failed,
    results,
  };
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
