import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs, { type BindParams, type Database as SqlJsDatabase, type Statement as SqlJsStatement } from 'sql.js';

import type {
  D1DatabaseLike,
  PreparedStatementLike,
  StatementResult,
  StatementRunResult,
} from '../../src/config';

const require = createRequire(import.meta.url);
const defaultMigrationDirectory = fileURLToPath(new URL('../../migrations/', import.meta.url));

type SqlBinding = string | number | Uint8Array | null;

function normalizeBindings(values: unknown[]): SqlBinding[] {
  return values.map((value) => {
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value === 'string' || typeof value === 'number' || value instanceof Uint8Array) {
      return value;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    throw new TypeError(`Unsupported SQLite bind value: ${typeof value}`);
  });
}

function statementBindings(values: unknown[]): BindParams {
  return normalizeBindings(values);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class SqlJsPreparedStatement implements PreparedStatementLike {
  private values: unknown[] = [];

  public constructor(
    private readonly database: SqlJsDatabase,
    private readonly query: string,
  ) {}

  bind(...values: unknown[]): PreparedStatementLike {
    this.values = values;
    return this;
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const statement = this.database.prepare(this.query);
    try {
      statement.bind(statementBindings(this.values));
      return statement.step() ? statement.getAsObject() as T : null;
    } finally {
      statement.free();
    }
  }

  async all<T = Record<string, unknown>>(): Promise<StatementResult<T>> {
    const statement = this.database.prepare(this.query);
    try {
      statement.bind(statementBindings(this.values));
      const results: T[] = [];
      while (statement.step()) {
        results.push(statement.getAsObject() as T);
      }
      return { success: true, results };
    } catch (error) {
      return { success: false, error: errorMessage(error) };
    } finally {
      statement.free();
    }
  }

  async run(): Promise<StatementRunResult> {
    const statement = this.database.prepare(this.query);
    try {
      statement.bind(statementBindings(this.values));
      statement.step();
      return { success: true, meta: { changes: this.database.getRowsModified() } };
    } catch (error) {
      return { success: false, error: errorMessage(error) };
    } finally {
      statement.free();
    }
  }
}

/**
 * Small D1-compatible adapter over a real sql.js SQLite database.
 *
 * The adapter intentionally implements only the Cloudflare binding surface
 * consumed by the application. It is kept in the Glama runtime so the Worker
 * bundle never imports Node or sql.js.
 */
export class SqlJsD1Database implements D1DatabaseLike {
  public constructor(public readonly sqlite: SqlJsDatabase) {}

  prepare(query: string): PreparedStatementLike {
    return new SqlJsPreparedStatement(this.sqlite, query);
  }

  async batch<T = unknown>(statements: PreparedStatementLike[]): Promise<T[]> {
    this.sqlite.run('begin');
    const results: unknown[] = [];
    try {
      for (const statement of statements) {
        const result = await statement.run();
        if (!result.success) {
          throw new Error(result.error ?? 'SQLite batch statement failed');
        }
        results.push(result);
      }
      this.sqlite.run('commit');
      return results as T[];
    } catch (error) {
      try {
        this.sqlite.run('rollback');
      } catch {
        // Preserve the original statement error if rollback itself fails.
      }
      throw error;
    }
  }
}

export function migrationFiles(migrationDirectory = defaultMigrationDirectory): string[] {
  return readdirSync(migrationDirectory)
    .filter((file) => /^\d+_.+\.sql$/u.test(file))
    .sort();
}

export function applyMigrations(sqlite: SqlJsDatabase, migrationDirectory = defaultMigrationDirectory): void {
  for (const file of migrationFiles(migrationDirectory)) {
    sqlite.run(readFileSync(join(migrationDirectory, file), 'utf8'));
  }
}

export async function createSqlJsD1Database(options: {
  migrationDirectory?: string;
  wasmPath?: string;
} = {}): Promise<SqlJsD1Database> {
  const SQL = await initSqlJs({
    locateFile: (file) => options.wasmPath ?? require.resolve(`sql.js/dist/${file}`),
  });
  const sqlite = new SQL.Database();
  applyMigrations(sqlite, options.migrationDirectory);
  return new SqlJsD1Database(sqlite);
}

export type { SqlJsDatabase, SqlJsStatement };
