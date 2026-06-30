import { describe, expect, it } from 'vitest';

import { runLocalEval } from '../scripts/eval-local';
import { readRemoteEvalConfig, runRemoteEval } from '../scripts/eval-remote';

describe('memory behavior eval runner', () => {
  it('runs the local fake-backed eval without hard safety failures', async () => {
    const result = await runLocalEval();

    expect(result.summary.retrieval_cases).toBeGreaterThanOrEqual(20);
    expect(result.summary.wrong_scope_results).toBe(0);
    expect(result.summary.wrong_tenant_results).toBe(0);
    expect(result.summary.forbidden_results).toBe(0);
    expect(result.summary.hard_failure_count).toBe(0);
    expect(result.summary.kg_passed).toBe(result.summary.kg_cases);
    expect(result.summary.recall_at_5).toBeGreaterThanOrEqual(0);
    expect(result.summary.mrr).toBeGreaterThanOrEqual(0);
  });

  it('skips remote eval safely when environment is not configured', async () => {
    const env = {};
    expect(readRemoteEvalConfig(env)).toMatchObject({ skipped: true });

    const result = await runRemoteEval({
      env,
      fetchImpl: async () => {
        throw new Error('fetch should not be called when remote eval is skipped');
      },
    });
    expect(result.skipped).toBe(true);
  });

  it('falls back to a generated remote eval run id when the configured value is blank', () => {
    const config = readRemoteEvalConfig({
      MEMHEAVEN_EVAL_BASE_URL: 'https://memory.example.com',
      MEMHEAVEN_EVAL_BEARER_TOKEN: 'token-a',
      MEMHEAVEN_EVAL_RUN_ID: '   ',
    });

    expect(config).toMatchObject({
      baseUrl: 'https://memory.example.com',
      bearerToken: 'token-a',
    });
    expect('runId' in config && config.runId).toMatch(/^per-34-/u);
  });

  it('cleans up the remote smoke drawer when search verification fails', async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { params?: { name?: string } };
      const name = body.params?.name ?? 'unknown';
      calls.push(name);
      const structuredContent = name === 'mempalace_add_drawer'
        ? { drawer_id: 'drawer-smoke-1' }
        : name === 'mempalace_search'
          ? { results: [] }
          : { success: true };
      return new Response(JSON.stringify({ result: { structuredContent } }), { status: 200 });
    };

    await expect(runRemoteEval({
      env: {
        MEMHEAVEN_EVAL_BASE_URL: 'https://memory.example.com',
        MEMHEAVEN_EVAL_BEARER_TOKEN: 'token-a',
        MEMHEAVEN_EVAL_RUN_ID: 'cleanup-test',
      },
      fetchImpl,
    })).rejects.toThrow('Remote eval search did not find');

    expect(calls).toEqual([
      'mempalace_add_drawer',
      'mempalace_status',
      'mempalace_search',
      'mempalace_delete_drawer',
    ]);
  });

  it('checks optional second-tenant isolation before deleting the smoke drawer', async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        params?: { name?: string; arguments?: Record<string, unknown> };
      };
      const name = body.params?.name ?? 'unknown';
      const authorization = new Headers(init?.headers).get('authorization') ?? '';
      calls.push(`${name}:${authorization}`);
      const structuredContent = name === 'mempalace_add_drawer'
        ? { drawer_id: 'drawer-smoke-1' }
        : name === 'mempalace_search' && authorization === 'Bearer token-b'
          ? { results: [] }
          : name === 'mempalace_search'
            ? { results: [{ drawer_id: 'drawer-smoke-1', text: 'PER-34 remote smoke order-test silver-eval-lantern' }] }
            : name === 'mempalace_kg_query'
              ? { facts: body.params?.arguments?.as_of === '2026-01-02' ? [{ predicate: 'status', object: 'active' }] : [] }
              : { success: true };
      return new Response(JSON.stringify({ result: { structuredContent } }), { status: 200 });
    };

    const result = await runRemoteEval({
      env: {
        MEMHEAVEN_EVAL_BASE_URL: 'https://memory.example.com',
        MEMHEAVEN_EVAL_BEARER_TOKEN: 'token-a',
        MEMHEAVEN_EVAL_BEARER_TOKEN_B: 'token-b',
        MEMHEAVEN_EVAL_RUN_ID: 'order-test',
      },
      fetchImpl,
    });

    expect(result.skipped).toBe(false);
    const secondTenantSearchIndex = calls.indexOf('mempalace_search:Bearer token-b');
    const cleanupIndex = calls.indexOf('mempalace_delete_drawer:Bearer token-a');
    expect(secondTenantSearchIndex).toBeGreaterThan(-1);
    expect(cleanupIndex).toBeGreaterThan(-1);
    expect(secondTenantSearchIndex).toBeLessThan(cleanupIndex);
  });

  it('still cleans up the smoke drawer when second-tenant isolation fails', async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { params?: { name?: string } };
      const name = body.params?.name ?? 'unknown';
      const authorization = new Headers(init?.headers).get('authorization') ?? '';
      calls.push(`${name}:${authorization}`);
      const structuredContent = name === 'mempalace_add_drawer'
        ? { drawer_id: 'drawer-smoke-1' }
        : name === 'mempalace_search'
          ? { results: [{ drawer_id: 'drawer-smoke-1', text: 'PER-34 remote smoke leak-test silver-eval-lantern leaked' }] }
          : { success: true };
      return new Response(JSON.stringify({ result: { structuredContent } }), { status: 200 });
    };

    await expect(runRemoteEval({
      env: {
        MEMHEAVEN_EVAL_BASE_URL: 'https://memory.example.com',
        MEMHEAVEN_EVAL_BEARER_TOKEN: 'token-a',
        MEMHEAVEN_EVAL_BEARER_TOKEN_B: 'token-b',
        MEMHEAVEN_EVAL_RUN_ID: 'leak-test',
      },
      fetchImpl,
    })).rejects.toThrow('second tenant search saw first tenant');

    expect(calls).toContain('mempalace_delete_drawer:Bearer token-a');
    expect(calls.indexOf('mempalace_search:Bearer token-b')).toBeLessThan(calls.indexOf('mempalace_delete_drawer:Bearer token-a'));
  });
});
