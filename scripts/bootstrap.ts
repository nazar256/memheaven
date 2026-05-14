import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const REQUIRED_METADATA_INDEXES = [
  { propertyName: 'tenant_id', type: 'string' },
  { propertyName: 'wing', type: 'string' },
  { propertyName: 'room', type: 'string' },
  { propertyName: 'kind', type: 'string' },
] as const;

interface BootstrapOptions {
  configPath: string;
  cwd: string;
  dryRun: boolean;
  skipMigrations: boolean;
  baseUrl: string | undefined;
}

interface ResourceNames {
  workerName: string;
  d1DatabaseName: string;
  r2BucketName: string;
  vectorizeIndexName: string;
  embeddingDimensions: number;
}

interface D1ListEntry {
  uuid: string;
  name: string;
}

interface VectorizeListEntry {
  name: string;
  config?: {
    dimensions?: number;
    metric?: string;
  };
}

interface CommandResult {
  stdout: string;
  stderr: string;
  combined: string;
  status: number;
}

export function parseBootstrapArgs(argv = process.argv.slice(2), cwd = process.cwd()): BootstrapOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      config: { type: 'string' },
      'base-url': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'skip-migrations': { type: 'boolean', default: false },
    },
  });

  return {
    configPath: resolve(cwd, values.config ?? 'wrangler.toml'),
    cwd,
    dryRun: values['dry-run'],
    skipMigrations: values['skip-migrations'],
    baseUrl: values['base-url'] ? normalizeBaseUrl(values['base-url']) : undefined,
  };
}

export function extractResourceNames(configText: string): ResourceNames {
  return {
    workerName: extractQuotedValue(configText, /^name\s*=\s*"([^"]+)"/m, 'worker name'),
    d1DatabaseName: extractFromNamedBlock(configText, '[[d1_databases]]', 'database_name'),
    r2BucketName: extractFromNamedBlock(configText, '[[r2_buckets]]', 'bucket_name'),
    vectorizeIndexName: extractFromNamedBlock(configText, '[[vectorize]]', 'index_name'),
    embeddingDimensions: Number(extractQuotedValue(configText, /^EMBEDDING_DIMENSIONS\s*=\s*"(\d+)"/m, 'EMBEDDING_DIMENSIONS')),
  };
}

export function patchD1DatabaseId(configText: string, databaseName: string, databaseId: string): string {
  const blocks = findTomlArrayBlocks(configText, '[[d1_databases]]');
  const matching = blocks.filter((block) => new RegExp(`^database_name\\s*=\\s*"${escapeRegExp(databaseName)}"`, 'm').test(block.text));
  if (matching.length !== 1) {
    throw new Error(`Expected exactly one [[d1_databases]] block for ${databaseName}, found ${matching.length}`);
  }

  const block = matching[0]!;
  const databaseIdPattern = /^database_id\s*=\s*"[^"]*"/m;
  let updatedBlock = block.text;
  if (databaseIdPattern.test(updatedBlock)) {
    updatedBlock = updatedBlock.replace(databaseIdPattern, `database_id = "${databaseId}"`);
  } else {
    const databaseNamePattern = new RegExp(`^(database_name\\s*=\\s*"${escapeRegExp(databaseName)}".*)$`, 'm');
    if (!databaseNamePattern.test(updatedBlock)) {
      throw new Error(`Could not find database_name line for ${databaseName}`);
    }
    updatedBlock = updatedBlock.replace(databaseNamePattern, `$1\ndatabase_id = "${databaseId}"`);
  }

  return `${configText.slice(0, block.start)}${updatedBlock}${configText.slice(block.end)}`;
}

export function patchPublicBaseUrl(configText: string, baseUrl: string): string {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  return replaceTopLevelTomlValue(
    replaceTopLevelTomlValue(
      replaceTopLevelTomlValue(configText, 'OAUTH_ISSUER', normalizedBaseUrl),
      'MCP_RESOURCE',
      `${normalizedBaseUrl}/mcp`,
    ),
    'MCP_AUDIENCE',
    `${normalizedBaseUrl}/mcp`,
  );
}

export function parseD1ListOutput(text: string): D1ListEntry[] {
  return JSON.parse(text) as D1ListEntry[];
}

export function parseVectorizeListOutput(text: string): VectorizeListEntry[] {
  const trimmed = text.trim();
  const jsonStart = trimmed.indexOf('[');
  if (jsonStart === -1) {
    throw new Error('Could not locate JSON in Vectorize list output');
  }
  return JSON.parse(trimmed.slice(jsonStart)) as VectorizeListEntry[];
}

export function parseR2BucketNames(text: string): string[] {
  return text
    .split(/\r?\n/u)
    .map((line) => /^name:\s+(.+?)\s*$/u.exec(line)?.[1])
    .filter((value): value is string => Boolean(value));
}

async function main() {
  const options = parseBootstrapArgs();
  const configText = readFileSync(options.configPath, 'utf8');
  const resources = extractResourceNames(configText);

  logStep(`Checking Wrangler authentication for worker ${resources.workerName}`);
  if (!options.dryRun) {
    runWrangler(options, ['whoami']);
  }

  const databaseId = ensureD1Database(options, resources.d1DatabaseName);
  ensureR2Bucket(options, resources.r2BucketName);
  ensureVectorizeIndex(options, resources.vectorizeIndexName, resources.embeddingDimensions);
  ensureVectorizeMetadataIndexes(options, resources.vectorizeIndexName);

  let patchedConfig = patchD1DatabaseId(configText, resources.d1DatabaseName, databaseId);
  if (options.baseUrl) {
    patchedConfig = patchPublicBaseUrl(patchedConfig, options.baseUrl);
  }
  if (patchedConfig !== configText) {
    if (options.dryRun) {
      logStep(`Would update ${options.configPath} with D1 database_id${options.baseUrl ? ' and public base URL' : ''}`);
    } else {
      writeFileSync(options.configPath, patchedConfig, 'utf8');
      logStep(`Updated ${options.configPath} with D1 database_id${options.baseUrl ? ' and public base URL' : ''}`);
    }
  }

  if (!options.skipMigrations) {
    if (options.dryRun) {
      logStep(`Would apply remote migrations to ${resources.d1DatabaseName}`);
    } else {
      runWrangler(options, ['d1', 'migrations', 'apply', resources.d1DatabaseName, '--remote']);
      logStep(`Applied remote migrations to ${resources.d1DatabaseName}`);
    }
  }

  process.stdout.write(`${JSON.stringify({
    worker: resources.workerName,
    d1_database: { name: resources.d1DatabaseName, id: databaseId },
    r2_bucket: resources.r2BucketName,
    vectorize_index: resources.vectorizeIndexName,
    metadata_indexes: REQUIRED_METADATA_INDEXES,
    dry_run: options.dryRun,
    migrations_applied: !options.skipMigrations && !options.dryRun,
    next_steps: [
      'Run npm run secrets:generate, then set JWT_SIGNING_SECRET, TOKEN_ENCRYPTION_KEY, and AUTH_KEY_PEPPER with wrangler secret put.',
      'Run npm run keygen to create the first access key and sync ACCESS_KEYS_JSON.',
      'Deploy with npx wrangler deploy once secrets are set.',
    ],
  }, null, 2)}\n`);
}

function ensureD1Database(options: BootstrapOptions, databaseName: string): string {
  const existing = parseD1ListOutput(runWrangler(options, ['d1', 'list', '--json']).stdout).find((entry) => entry.name === databaseName);
  if (existing) {
    logStep(`D1 database ${databaseName} already exists (${existing.uuid})`);
    return existing.uuid;
  }

  if (options.dryRun) {
    logStep(`Would create D1 database ${databaseName}`);
    return '<dry-run-database-id>';
  }

  const created = runWrangler(options, ['d1', 'create', databaseName]).combined;
  const match = /database_id\s*=\s*"([^"]+)"/u.exec(created);
  if (!match?.[1]) {
    throw new Error(`Could not parse database_id from Wrangler output for ${databaseName}`);
  }
  logStep(`Created D1 database ${databaseName} (${match[1]})`);
  return match[1];
}

function ensureR2Bucket(options: BootstrapOptions, bucketName: string): void {
  const existingBuckets = parseR2BucketNames(runWrangler(options, ['r2', 'bucket', 'list']).combined);
  if (existingBuckets.includes(bucketName)) {
    logStep(`R2 bucket ${bucketName} already exists`);
    return;
  }

  if (options.dryRun) {
    logStep(`Would create R2 bucket ${bucketName}`);
    return;
  }

  runWrangler(options, ['r2', 'bucket', 'create', bucketName]);
  logStep(`Created R2 bucket ${bucketName}`);
}

function ensureVectorizeIndex(options: BootstrapOptions, indexName: string, dimensions: number): void {
  const existingIndexes = parseVectorizeListOutput(runWrangler(options, ['vectorize', 'list', '--json']).combined);
  const existing = existingIndexes.find((entry) => entry.name === indexName);
  if (existing) {
    const currentDimensions = existing.config?.dimensions;
    if (currentDimensions !== dimensions) {
      throw new Error(`Vectorize index ${indexName} exists with dimensions ${currentDimensions}, expected ${dimensions}`);
    }
    logStep(`Vectorize index ${indexName} already exists (${dimensions} dims)`);
    return;
  }

  if (options.dryRun) {
    logStep(`Would create Vectorize index ${indexName} (${dimensions} dims)`);
    return;
  }

  runWrangler(options, ['vectorize', 'create', indexName, '--dimensions', String(dimensions), '--metric', 'cosine']);
  logStep(`Created Vectorize index ${indexName}`);
}

function ensureVectorizeMetadataIndexes(options: BootstrapOptions, indexName: string): void {
  for (const metadataIndex of REQUIRED_METADATA_INDEXES) {
    if (options.dryRun) {
      logStep(`Would ensure Vectorize metadata index ${indexName}:${metadataIndex.propertyName}`);
      continue;
    }

    const result = runWrangler(options, [
      'vectorize',
      'create-metadata-index',
      indexName,
      '--property-name',
      metadataIndex.propertyName,
      '--type',
      metadataIndex.type,
    ], { allowFailure: true });

    if (result.status === 0 || result.combined.includes('already exists')) {
      logStep(`Vectorize metadata index ${indexName}:${metadataIndex.propertyName} is ready`);
      continue;
    }
    if (result.combined.includes('504 Gateway Timeout') || result.combined.includes('upstream request timeout')) {
      const retry = runWrangler(options, [
        'vectorize',
        'create-metadata-index',
        indexName,
        '--property-name',
        metadataIndex.propertyName,
        '--type',
        metadataIndex.type,
      ], { allowFailure: true });
      if (retry.status === 0 || retry.combined.includes('already exists')) {
        logStep(`Vectorize metadata index ${indexName}:${metadataIndex.propertyName} is ready after retry`);
        continue;
      }
    }

    throw new Error(`Failed to ensure Vectorize metadata index ${indexName}:${metadataIndex.propertyName}\n${result.combined}`);
  }
}

function runWrangler(options: BootstrapOptions, args: string[], execution?: { allowFailure?: boolean }): CommandResult {
  const result = spawnSync('npx', ['wrangler', ...args], {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const combined = [stdout, stderr].filter(Boolean).join('\n').trim();
  const status = result.status ?? 1;

  if (result.error) {
    throw new Error(`Failed to run npx wrangler ${args.join(' ')}: ${result.error.message}`);
  }
  if (status !== 0 && !execution?.allowFailure) {
    throw new Error(`npx wrangler ${args.join(' ')} failed with exit code ${status}\n${combined}`);
  }

  return { stdout, stderr, combined, status };
}

function extractQuotedValue(text: string, pattern: RegExp, label: string): string {
  const match = pattern.exec(text);
  if (!match?.[1]) {
    throw new Error(`Could not find ${label} in wrangler config`);
  }
  return match[1];
}

function extractFromNamedBlock(configText: string, blockHeader: string, key: string): string {
  const block = findTomlArrayBlocks(configText, blockHeader)[0];
  if (!block) {
    throw new Error(`Could not find ${blockHeader} block in wrangler config`);
  }
  return extractQuotedValue(block.text, new RegExp(`^${escapeRegExp(key)}\\s*=\\s*"([^"]+)"`, 'm'), `${key} in ${blockHeader}`);
}

function replaceTopLevelTomlValue(configText: string, key: string, value: string): string {
  const pattern = new RegExp(`^${escapeRegExp(key)}\\s*=\\s*"[^"]*"`, 'm');
  if (!pattern.test(configText)) {
    throw new Error(`Could not find ${key} in wrangler config`);
  }
  return configText.replace(pattern, `${key} = "${value}"`);
}

function normalizeBaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid --base-url: ${value}`);
  }
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) {
    throw new Error('--base-url must use HTTPS, except localhost/127.0.0.1 for local development');
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new Error('--base-url must be an origin only, for example https://memory.example.com (do not include /mcp)');
  }
  parsed.hash = '';
  parsed.search = '';
  parsed.pathname = parsed.pathname.replace(/\/+$/u, '');
  return parsed.toString().replace(/\/+$/u, '');
}

function findTomlArrayBlocks(text: string, header: string): Array<{ start: number; end: number; text: string }> {
  const headerPattern = new RegExp(`^${escapeRegExp(header)}\\s*$`, 'gm');
  const starts = Array.from(text.matchAll(headerPattern)).map((match) => match.index ?? -1).filter((index) => index >= 0);
  return starts.map((start) => {
    const nextSectionPattern = /^\[/gm;
    nextSectionPattern.lastIndex = start + header.length;
    let end = text.length;
    for (const next of text.slice(start + header.length).matchAll(/^\[/gm)) {
      const candidate = start + header.length + (next.index ?? 0);
      if (candidate > start) {
        end = candidate;
        break;
      }
    }
    return { start, end, text: text.slice(start, end) };
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function logStep(message: string): void {
  process.stdout.write(`[bootstrap] ${message}\n`);
}

function isMainModule(): boolean {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
