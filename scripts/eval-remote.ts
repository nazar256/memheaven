import { pathToFileURL } from 'node:url';

type RemoteEvalEnv = Record<string, string | undefined>;

interface RemoteEvalConfig {
  baseUrl: string;
  bearerToken: string;
  bearerTokenB: string | null;
  runId: string;
}

interface RemoteEvalResult {
  skipped: boolean;
  reason?: string;
  run_id?: string;
  checks?: Array<{ name: string; ok: boolean; detail?: string }>;
}

export function readRemoteEvalConfig(env: RemoteEvalEnv = process.env): RemoteEvalConfig | { skipped: true; reason: string } {
  const baseUrl = env.MEMHEAVEN_EVAL_BASE_URL?.replace(/\/$/u, '');
  const bearerToken = env.MEMHEAVEN_EVAL_BEARER_TOKEN;
  const runId = env.MEMHEAVEN_EVAL_RUN_ID?.trim() || `per-34-${Date.now().toString(36)}`;
  if (!baseUrl || !bearerToken) {
    return { skipped: true, reason: 'Set MEMHEAVEN_EVAL_BASE_URL and MEMHEAVEN_EVAL_BEARER_TOKEN to run the opt-in remote eval.' };
  }
  return {
    baseUrl,
    bearerToken,
    bearerTokenB: env.MEMHEAVEN_EVAL_BEARER_TOKEN_B ?? null,
    runId,
  };
}

export async function runRemoteEval(input: { env?: RemoteEvalEnv; fetchImpl?: typeof fetch } = {}): Promise<RemoteEvalResult> {
  const config = readRemoteEvalConfig(input.env ?? process.env);
  if ('skipped' in config) {
    return { skipped: true, reason: config.reason };
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];
  const call = async <T>(toolName: string, args: Record<string, unknown>, token = config.bearerToken): Promise<T> => {
    const response = await fetchImpl(`${config.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-03-26',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: `${toolName}-${config.runId}`, method: 'tools/call', params: { name: toolName, arguments: args } }),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${toolName} HTTP ${response.status}: ${text.slice(0, 500)}`);
    }
    const body = JSON.parse(text) as { error?: unknown; result?: { isError?: boolean; structuredContent?: T; content?: Array<{ text?: string }> } };
    if (body.error || body.result?.isError) {
      throw new Error(`${toolName} returned MCP error: ${JSON.stringify(body.error ?? body.result?.content ?? [])}`);
    }
    return body.result?.structuredContent as T;
  };

  const uniquePhrase = `PER-34 remote smoke ${config.runId} silver-eval-lantern`;
  const kgSubject = `PER-34 remote smoke ${config.runId}`;
  let smokeDrawerId: string | null = null;
  let drawerPhaseError: unknown;
  try {
    const addResult = await call<{ drawer_id: string }>('mempalace_add_drawer', {
      wing: 'eval-smoke',
      room: config.runId,
      content: uniquePhrase,
      source_file: `evals/per-34/${config.runId}.md`,
      added_by: 'per-34-remote-eval',
    });
    smokeDrawerId = addResult.drawer_id;
    checks.push({ name: 'add_drawer', ok: Boolean(addResult.drawer_id), detail: addResult.drawer_id });
    await call('mempalace_status', {});
    checks.push({ name: 'status', ok: true });

    const search = await retry(async () => call<{ results: Array<{ drawer_id: string; text: string }> }>('mempalace_search', { query: uniquePhrase, wing: 'eval-smoke', room: config.runId, limit: 5 }), 3);
    const foundDrawer = search.results.some((result) => result.drawer_id === addResult.drawer_id || result.text.includes(uniquePhrase));
    checks.push({ name: 'search_added_drawer', ok: foundDrawer });
    if (!foundDrawer) {
      throw new Error('Remote eval search did not find the namespaced drawer that was just added.');
    }
    if (config.bearerTokenB) {
      const otherTenantSearch = await call<{ results: Array<{ text: string }> }>('mempalace_search', { query: uniquePhrase, limit: 5 }, config.bearerTokenB);
      const leaked = otherTenantSearch.results.some((result) => result.text.includes(uniquePhrase));
      checks.push({ name: 'optional_second_tenant_search_isolation', ok: !leaked });
      if (leaked) {
        throw new Error('Remote eval second tenant search saw first tenant smoke drawer content.');
      }
    }
  } catch (error) {
    drawerPhaseError = error;
  }
  if (smokeDrawerId) {
    try {
      await call('mempalace_delete_drawer', { drawer_id: smokeDrawerId });
      checks.push({ name: 'delete_drawer_cleanup', ok: true });
    } catch (error) {
      checks.push({ name: 'delete_drawer_cleanup', ok: false, detail: error instanceof Error ? error.message : String(error) });
      if (!drawerPhaseError) {
        drawerPhaseError = error;
      }
    }
  }
  if (drawerPhaseError) {
    throw drawerPhaseError;
  }

  await call('mempalace_kg_add', { subject: kgSubject, predicate: 'status', object: 'active', valid_from: '2026-01-01' });
  const currentBefore = await call<{ facts: Array<{ predicate: string; object: string }> }>('mempalace_kg_query', { entity: kgSubject, direction: 'outgoing', as_of: '2026-01-02' });
  const kgFoundBefore = currentBefore.facts.some((fact) => fact.predicate === 'status' && fact.object === 'active');
  checks.push({ name: 'kg_add_query', ok: kgFoundBefore });
  if (!kgFoundBefore) {
    throw new Error('Remote eval KG query did not return the added fact.');
  }
  await call('mempalace_kg_invalidate', { subject: kgSubject, predicate: 'status', object: 'active', ended: '2026-02-01' });
  const currentAfter = await call<{ facts: Array<{ predicate: string; object: string }> }>('mempalace_kg_query', { entity: kgSubject, direction: 'outgoing', as_of: '2026-03-01' });
  const kgStillCurrent = currentAfter.facts.some((fact) => fact.predicate === 'status' && fact.object === 'active');
  checks.push({ name: 'kg_invalidate_current_query', ok: !kgStillCurrent });
  if (kgStillCurrent) {
    throw new Error('Remote eval KG fact remained current after invalidation.');
  }

  return { skipped: false, run_id: config.runId, checks };
}

async function retry<T>(fn: () => Promise<T>, attempts: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError;
}

async function main(): Promise<void> {
  const result = await runRemoteEval();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
