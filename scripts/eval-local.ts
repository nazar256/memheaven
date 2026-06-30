import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

import { requireConfig } from '../src/config';
import { addDrawer, checkDuplicate, searchDrawers, type SearchDrawersInput } from '../src/memory/drawers';
import { kgAdd, kgInvalidate, kgQuery, kgTimeline } from '../src/memory/kg';
import type { TenantAuthContext } from '../src/memory/types';
import { createEnvWithKeys, mintDirectAccessToken, verifyDirectAccessToken } from '../tests/helpers/testData';

type TenantId = 'tenant-a' | 'tenant-b';

interface DrawerFixture {
  fixture_id: string;
  tenant: TenantId;
  wing: string;
  room: string;
  content: string;
}

interface RetrievalCaseFixture {
  id: string;
  tenant: TenantId;
  query: string;
  limit: number;
  wing?: string;
  room?: string;
  expected_any_fixture_ids: string[];
  forbid_fixture_ids?: string[];
  forbid_tenants?: TenantId[];
  hard_scope?: boolean;
  tags?: string[];
}

interface DuplicateCaseFixture {
  id: string;
  tenant: TenantId;
  content: string;
  threshold: number;
  expect_duplicate: boolean;
  expected_fixture_id?: string;
  forbid_tenants?: TenantId[];
}

interface KgCaseFixture {
  id: string;
  scenario: string;
}

export interface MemoryBehaviorFixture {
  version: string;
  notes: string[];
  drawers: DrawerFixture[];
  retrieval_cases: RetrievalCaseFixture[];
  duplicate_cases: DuplicateCaseFixture[];
  kg_cases: KgCaseFixture[];
}

interface FixtureRecord {
  fixture_id: string;
  tenant: TenantId;
  wing: string;
  room: string;
}

interface HardFailure {
  case_id: string;
  category: 'fixture' | 'tenant_leak' | 'scope_leak' | 'forbidden_result' | 'duplicate' | 'kg';
  message: string;
}

interface RetrievalCaseResult {
  id: string;
  tags: string[];
  rank: number | null;
  top_fixture_ids: string[];
  duplicate_final_drawer_results: number;
  hard_failures: HardFailure[];
}

interface DuplicateCaseResult {
  id: string;
  matched_fixture_ids: string[];
  passed: boolean;
  hard_failures: HardFailure[];
}

interface KgCaseResult {
  id: string;
  scenario: string;
  passed: boolean;
  hard_failures: HardFailure[];
}

export interface LocalEvalResult {
  fixture_version: string;
  runner_version: string;
  environment: string;
  summary: {
    retrieval_cases: number;
    recall_at_1: number;
    recall_at_3: number;
    recall_at_5: number;
    mrr: number;
    mean_rank: number | null;
    duplicate_final_drawer_results: number;
    wrong_scope_results: number;
    wrong_tenant_results: number;
    forbidden_results: number;
    duplicate_cases: number;
    kg_cases: number;
    kg_passed: number;
    hard_failure_count: number;
  };
  retrieval_results: RetrievalCaseResult[];
  duplicate_results: DuplicateCaseResult[];
  kg_results: KgCaseResult[];
  hard_failures: HardFailure[];
  known_limitations: string[];
}

const RUNNER_VERSION = 'per-34-local-eval.v1';

export async function loadMemoryBehaviorFixture(path = new URL('../evals/fixtures/memory-behavior.json', import.meta.url)): Promise<MemoryBehaviorFixture> {
  const parsed = JSON.parse(await readFile(path, 'utf8')) as MemoryBehaviorFixture;
  validateMemoryBehaviorFixture(parsed);
  return parsed;
}

export function validateMemoryBehaviorFixture(fixture: MemoryBehaviorFixture): void {
  const drawerIds = new Set<string>();
  for (const drawer of fixture.drawers) {
    if (drawerIds.has(drawer.fixture_id)) {
      throw new Error(`Duplicate drawer fixture_id: ${drawer.fixture_id}`);
    }
    drawerIds.add(drawer.fixture_id);
    if (/secret|token|password|bearer/i.test(drawer.content) && !/access-key consent|bearer-token fallback|separate credentials/i.test(drawer.content)) {
      throw new Error(`Drawer fixture looks like it may contain sensitive material: ${drawer.fixture_id}`);
    }
  }
  for (const retrievalCase of fixture.retrieval_cases) {
    for (const expectedId of retrievalCase.expected_any_fixture_ids) {
      if (!drawerIds.has(expectedId)) {
        throw new Error(`Retrieval case ${retrievalCase.id} references missing expected fixture ${expectedId}`);
      }
    }
    for (const forbiddenId of retrievalCase.forbid_fixture_ids ?? []) {
      if (!drawerIds.has(forbiddenId)) {
        throw new Error(`Retrieval case ${retrievalCase.id} references missing forbidden fixture ${forbiddenId}`);
      }
    }
  }
  for (const duplicateCase of fixture.duplicate_cases) {
    if (duplicateCase.expected_fixture_id && !drawerIds.has(duplicateCase.expected_fixture_id)) {
      throw new Error(`Duplicate case ${duplicateCase.id} references missing expected fixture ${duplicateCase.expected_fixture_id}`);
    }
  }
}

export async function runLocalEval(fixtureInput?: MemoryBehaviorFixture): Promise<LocalEvalResult> {
  const fixture = fixtureInput ?? await loadMemoryBehaviorFixture();
  const env = await createEnvWithKeys();
  const config = requireConfig(env);
  const authByTenant: Record<TenantId, TenantAuthContext> = {
    'tenant-a': await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a')),
    'tenant-b': await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-b')),
  };

  const fixtureByActualDrawerId = new Map<string, FixtureRecord>();
  for (const drawer of fixture.drawers) {
    const created = await addDrawer(env, config, authByTenant[drawer.tenant], {
      wing: drawer.wing,
      room: drawer.room,
      content: drawer.content,
      source_file: `evals/${fixture.version}/${drawer.fixture_id}.md`,
      added_by: 'per-34-local-eval',
    });
    fixtureByActualDrawerId.set(created.drawer_id, { fixture_id: drawer.fixture_id, tenant: drawer.tenant, wing: drawer.wing, room: drawer.room });
  }

  const retrievalResults = await runRetrievalCases(env, config, authByTenant, fixture, fixtureByActualDrawerId);
  const duplicateResults = await runDuplicateCases(env, config, authByTenant, fixture.duplicate_cases, fixtureByActualDrawerId);
  const kgResults = await runKgCases(env, config, authByTenant['tenant-a'], fixture.kg_cases);
  const hardFailures = [...retrievalResults, ...duplicateResults, ...kgResults].flatMap((result) => result.hard_failures);
  const ranks = retrievalResults.map((result) => result.rank).filter((rank): rank is number => rank !== null);
  const wrongScopeResults = hardFailures.filter((failure) => failure.category === 'scope_leak').length;
  const wrongTenantResults = hardFailures.filter((failure) => failure.category === 'tenant_leak').length;
  const forbiddenResults = hardFailures.filter((failure) => failure.category === 'forbidden_result').length;

  return {
    fixture_version: fixture.version,
    runner_version: RUNNER_VERSION,
    environment: 'fake-d1/fake-r2/fake-ai-char-frequency/fake-vectorize-cosine',
    summary: {
      retrieval_cases: retrievalResults.length,
      recall_at_1: fraction(retrievalResults.filter((result) => result.rank !== null && result.rank <= 1).length, retrievalResults.length),
      recall_at_3: fraction(retrievalResults.filter((result) => result.rank !== null && result.rank <= 3).length, retrievalResults.length),
      recall_at_5: fraction(retrievalResults.filter((result) => result.rank !== null && result.rank <= 5).length, retrievalResults.length),
      mrr: fraction(retrievalResults.reduce((sum, result) => sum + (result.rank === null ? 0 : 1 / result.rank), 0), retrievalResults.length),
      mean_rank: ranks.length === 0 ? null : fraction(ranks.reduce((sum, rank) => sum + rank, 0), ranks.length),
      duplicate_final_drawer_results: retrievalResults.reduce((sum, result) => sum + result.duplicate_final_drawer_results, 0),
      wrong_scope_results: wrongScopeResults,
      wrong_tenant_results: wrongTenantResults,
      forbidden_results: forbiddenResults,
      duplicate_cases: duplicateResults.length,
      kg_cases: kgResults.length,
      kg_passed: kgResults.filter((result) => result.passed).length,
      hard_failure_count: hardFailures.length,
    },
    retrieval_results: retrievalResults,
    duplicate_results: duplicateResults,
    kg_results: kgResults,
    hard_failures: hardFailures,
    known_limitations: [
      'Local eval uses deterministic test fakes, including character-frequency embeddings; quality metrics are for branch-to-branch comparison, not product claims.',
      'Search uses PER-31 hybrid reranking, but local eval still uses fake character-frequency embeddings, so exact identifier scores are baseline observations only.',
      'PER-33 deterministic KG conflict/staleness checks are unit-tested separately and are not scored in this fixture version.'
    ],
  };
}

async function runRetrievalCases(
  env: Parameters<typeof searchDrawers>[0],
  config: Parameters<typeof searchDrawers>[1],
  authByTenant: Record<TenantId, TenantAuthContext>,
  fixture: MemoryBehaviorFixture,
  fixtureByActualDrawerId: Map<string, FixtureRecord>,
): Promise<RetrievalCaseResult[]> {
  const output: RetrievalCaseResult[] = [];
  for (const retrievalCase of fixture.retrieval_cases) {
    const input: SearchDrawersInput = { query: retrievalCase.query, limit: retrievalCase.limit };
    if (retrievalCase.wing) input.wing = retrievalCase.wing;
    if (retrievalCase.room) input.room = retrievalCase.room;
    const search = await searchDrawers(env, config, authByTenant[retrievalCase.tenant], input);
    const topFixtureIds: string[] = [];
    const actualIds = new Set<string>();
    let duplicateFinalDrawerResults = 0;
    const hardFailures: HardFailure[] = [];
    for (const result of search.results) {
      if (actualIds.has(result.drawer_id)) {
        duplicateFinalDrawerResults += 1;
      }
      actualIds.add(result.drawer_id);
      const fixtureRecord = fixtureByActualDrawerId.get(result.drawer_id);
      if (!fixtureRecord) {
        hardFailures.push({ case_id: retrievalCase.id, category: 'fixture', message: `Search returned unknown drawer_id ${result.drawer_id}` });
        continue;
      }
      topFixtureIds.push(fixtureRecord.fixture_id);
      if (fixtureRecord.tenant !== retrievalCase.tenant || retrievalCase.forbid_tenants?.includes(fixtureRecord.tenant)) {
        hardFailures.push({ case_id: retrievalCase.id, category: 'tenant_leak', message: `Returned ${fixtureRecord.fixture_id} from ${fixtureRecord.tenant}` });
      }
      if (retrievalCase.hard_scope === true && (result.wing !== retrievalCase.wing || result.room !== retrievalCase.room)) {
        hardFailures.push({ case_id: retrievalCase.id, category: 'scope_leak', message: `Returned ${fixtureRecord.fixture_id} from ${result.wing}/${result.room}` });
      }
      if (retrievalCase.forbid_fixture_ids?.includes(fixtureRecord.fixture_id)) {
        hardFailures.push({ case_id: retrievalCase.id, category: 'forbidden_result', message: `Returned forbidden fixture ${fixtureRecord.fixture_id}` });
      }
    }
    const rankIndex = topFixtureIds.findIndex((fixtureId) => retrievalCase.expected_any_fixture_ids.includes(fixtureId));
    output.push({
      id: retrievalCase.id,
      tags: retrievalCase.tags ?? [],
      rank: rankIndex === -1 ? null : rankIndex + 1,
      top_fixture_ids: topFixtureIds,
      duplicate_final_drawer_results: duplicateFinalDrawerResults,
      hard_failures: hardFailures,
    });
  }
  return output;
}

async function runDuplicateCases(
  env: Parameters<typeof checkDuplicate>[0],
  config: Parameters<typeof checkDuplicate>[1],
  authByTenant: Record<TenantId, TenantAuthContext>,
  duplicateCases: DuplicateCaseFixture[],
  fixtureByActualDrawerId: Map<string, FixtureRecord>,
): Promise<DuplicateCaseResult[]> {
  const output: DuplicateCaseResult[] = [];
  for (const duplicateCase of duplicateCases) {
    const duplicate = await checkDuplicate(env, config, authByTenant[duplicateCase.tenant], { content: duplicateCase.content, threshold: duplicateCase.threshold });
    const matchedFixtureIds = duplicate.matches.map((match) => fixtureByActualDrawerId.get(duplicateMatchDrawerId(match))?.fixture_id).filter((fixtureId): fixtureId is string => Boolean(fixtureId));
    const hardFailures: HardFailure[] = [];
    if (duplicate.is_duplicate !== duplicateCase.expect_duplicate) {
      hardFailures.push({ case_id: duplicateCase.id, category: 'duplicate', message: `Expected duplicate=${duplicateCase.expect_duplicate} but got ${duplicate.is_duplicate}` });
    }
    if (duplicateCase.expected_fixture_id && !matchedFixtureIds.includes(duplicateCase.expected_fixture_id)) {
      hardFailures.push({ case_id: duplicateCase.id, category: 'duplicate', message: `Expected match ${duplicateCase.expected_fixture_id} but got ${matchedFixtureIds.join(', ')}` });
    }
    for (const match of duplicate.matches) {
      const fixtureRecord = fixtureByActualDrawerId.get(duplicateMatchDrawerId(match));
      if (fixtureRecord && duplicateCase.forbid_tenants?.includes(fixtureRecord.tenant)) {
        hardFailures.push({ case_id: duplicateCase.id, category: 'tenant_leak', message: `Duplicate check returned ${fixtureRecord.fixture_id} from ${fixtureRecord.tenant}` });
      }
    }
    output.push({ id: duplicateCase.id, matched_fixture_ids: matchedFixtureIds, passed: hardFailures.length === 0, hard_failures: hardFailures });
  }
  return output;
}

function duplicateMatchDrawerId(match: { id: string } & Partial<{ drawer_id: string }>): string {
  return match.drawer_id ?? match.id;
}

async function runKgCases(
  env: Parameters<typeof kgAdd>[0],
  config: Parameters<typeof kgAdd>[1],
  auth: TenantAuthContext,
  cases: KgCaseFixture[],
): Promise<KgCaseResult[]> {
  const output: KgCaseResult[] = [];
  for (const kgCase of cases) {
    const hardFailures: HardFailure[] = [];
    try {
      await runKgScenario(env, config, auth, kgCase, hardFailures);
    } catch (error) {
      hardFailures.push({ case_id: kgCase.id, category: 'kg', message: error instanceof Error ? error.message : String(error) });
    }
    output.push({ id: kgCase.id, scenario: kgCase.scenario, passed: hardFailures.length === 0, hard_failures: hardFailures });
  }
  return output;
}

async function runKgScenario(
  env: Parameters<typeof kgAdd>[0],
  config: Parameters<typeof kgAdd>[1],
  auth: TenantAuthContext,
  kgCase: KgCaseFixture,
  hardFailures: HardFailure[],
): Promise<void> {
  if (kgCase.scenario === 'current_add_query') {
    await kgAdd(env, config, auth, { subject: 'Eval Alpha', predicate: 'status', object: 'active', valid_from: '2026-01-01' });
    const current = await kgQuery(env, auth, { entity: 'Eval Alpha', direction: 'outgoing', as_of: '2026-01-02' });
    expectFact(kgCase.id, hardFailures, current.facts, 'status', 'active');
    return;
  }
  if (kgCase.scenario === 'invalidate_current_history') {
    await kgAdd(env, config, auth, { subject: 'Eval Beta', predicate: 'active_project', object: 'Oasis', valid_from: '2026-01-01' });
    await kgInvalidate(env, config, auth, { subject: 'Eval Beta', predicate: 'active_project', object: 'Oasis', ended: '2026-02-01' });
    const current = await kgQuery(env, auth, { entity: 'Eval Beta', direction: 'outgoing', as_of: '2026-03-01' });
    if (current.facts.some((fact) => fact.predicate === 'active_project' && fact.object === 'Oasis')) {
      hardFailures.push({ case_id: kgCase.id, category: 'kg', message: 'Invalidated fact still appears in current query' });
    }
    const timeline = await kgTimeline(env, auth, { entity: 'Eval Beta' });
    if (!timeline.timeline.some((fact) => fact.predicate === 'active_project' && fact.object === 'Oasis' && fact.valid_to === '2026-02-01')) {
      hardFailures.push({ case_id: kgCase.id, category: 'kg', message: 'Timeline did not preserve invalidated fact history' });
    }
    return;
  }
  if (kgCase.scenario === 'open_start_invalidate') {
    await kgAdd(env, config, auth, { subject: 'Eval Gamma', predicate: 'role', object: 'maintainer' });
    await kgInvalidate(env, config, auth, { subject: 'Eval Gamma', predicate: 'role', object: 'maintainer', ended: '2020-01-01' });
    const current = await kgQuery(env, auth, { entity: 'Eval Gamma', direction: 'outgoing', as_of: '2021-01-01' });
    if (current.facts.some((fact) => fact.predicate === 'role' && fact.object === 'maintainer')) {
      hardFailures.push({ case_id: kgCase.id, category: 'kg', message: 'Open-start invalidated fact still appears after ended date' });
    }
    return;
  }
  if (kgCase.scenario === 'as_of_history') {
    await kgAdd(env, config, auth, { subject: 'Eval Delta', predicate: 'works_on', object: 'Atlas', valid_from: '2024-01-01', valid_to: '2025-01-01' });
    const historical = await kgQuery(env, auth, { entity: 'Eval Delta', direction: 'outgoing', as_of: '2024-06-01' });
    expectFact(kgCase.id, hardFailures, historical.facts, 'works_on', 'Atlas');
    const current = await kgQuery(env, auth, { entity: 'Eval Delta', direction: 'outgoing', as_of: '2026-01-01' });
    if (current.facts.some((fact) => fact.predicate === 'works_on' && fact.object === 'Atlas')) {
      hardFailures.push({ case_id: kgCase.id, category: 'kg', message: 'Expired historical fact appeared in future as_of query' });
    }
    return;
  }
  if (kgCase.scenario === 'inverted_invalidation_rejected') {
    await kgAdd(env, config, auth, { subject: 'Eval Epsilon', predicate: 'likes', object: 'TypeScript', valid_from: '2026-01-01' });
    let rejected = false;
    try {
      await kgInvalidate(env, config, auth, { subject: 'Eval Epsilon', predicate: 'likes', object: 'TypeScript', ended: '2020-01-01' });
    } catch {
      rejected = true;
    }
    if (!rejected) {
      hardFailures.push({ case_id: kgCase.id, category: 'kg', message: 'Inverted invalidation was not rejected' });
    }
    const timeline = await kgTimeline(env, auth, { entity: 'Eval Epsilon' });
    if (!timeline.timeline.some((fact) => fact.predicate === 'likes' && fact.object === 'TypeScript' && fact.valid_to === null)) {
      hardFailures.push({ case_id: kgCase.id, category: 'kg', message: 'Rejected invalidation mutated target fact' });
    }
    return;
  }
  if (kgCase.scenario === 'direction_incoming') {
    await kgAdd(env, config, auth, { subject: 'Eval Zeta', predicate: 'depends_on', object: 'D1', valid_from: '2026-01-01' });
    const incoming = await kgQuery(env, auth, { entity: 'D1', direction: 'incoming', as_of: '2026-01-02' });
    expectFact(kgCase.id, hardFailures, incoming.facts, 'depends_on', 'D1');
    return;
  }
  hardFailures.push({ case_id: kgCase.id, category: 'kg', message: `Unknown KG scenario ${kgCase.scenario}` });
}

function expectFact(caseId: string, hardFailures: HardFailure[], facts: Array<{ predicate: string; object: string }>, predicate: string, object: string): void {
  if (!facts.some((fact) => fact.predicate === predicate && fact.object === object)) {
    hardFailures.push({ case_id: caseId, category: 'kg', message: `Expected fact ${predicate}=${object} was missing` });
  }
}

function fraction(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(6));
}

async function compareBaseline(result: LocalEvalResult, baselinePath: string): Promise<string[]> {
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8')) as LocalEvalResult;
  return JSON.stringify(result, null, 2) === JSON.stringify(baseline, null, 2) ? [] : ['Local eval output differs from committed baseline. Regenerate intentionally if this behavior change is expected.'];
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      fixture: { type: 'string' },
      'compare-baseline': { type: 'string' },
    },
  });
  const fixture = await loadMemoryBehaviorFixture(values.fixture ? pathToFileURL(values.fixture) : undefined);
  const result = await runLocalEval(fixture);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  const failures = [...result.hard_failures];
  if (values['compare-baseline']) {
    failures.push(...(await compareBaseline(result, values['compare-baseline'])).map((message) => ({ case_id: 'baseline', category: 'fixture' as const, message })));
  }
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
