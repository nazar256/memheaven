import type { D1DatabaseLike, PreparedStatementLike } from '../config';
import type { StatementRunResult } from '../config';

export function bindStatement(db: D1DatabaseLike, query: string, values: unknown[] = []): PreparedStatementLike {
  return db.prepare(query).bind(...values);
}

export async function queryAll<T>(db: D1DatabaseLike, query: string, values: unknown[] = []): Promise<T[]> {
  const result = await bindStatement(db, query, values).all<T>();
  if (!result.success) {
    throw new Error(result.error ?? 'D1 query failed');
  }
  return result.results ?? [];
}

export async function queryFirst<T>(db: D1DatabaseLike, query: string, values: unknown[] = []): Promise<T | null> {
  const result = await bindStatement(db, query, values).first<T>();
  return result ?? null;
}

export async function execute(db: D1DatabaseLike, query: string, values: unknown[] = []): Promise<void> {
  const result = await bindStatement(db, query, values).run();
  if (!result.success) {
    throw new Error(result.error ?? 'D1 execution failed');
  }
}

export async function executeResult(db: D1DatabaseLike, query: string, values: unknown[] = []): Promise<StatementRunResult> {
  const result = await bindStatement(db, query, values).run();
  if (!result.success) {
    throw new Error(result.error ?? 'D1 execution failed');
  }
  return result;
}

export async function executeBatch(db: D1DatabaseLike, statements: Array<{ query: string; values?: unknown[] }>): Promise<void> {
  const prepared = statements.map(({ query, values = [] }) => bindStatement(db, query, values));
  await db.batch(prepared);
}

export function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}
