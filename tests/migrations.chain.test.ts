import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';

describe('D1 migration chain', () => {
  it('applies every numbered migration to a fresh database in order', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    const migrationsDir = join(process.cwd(), 'migrations');
    const migrationFiles = readdirSync(migrationsDir)
      .filter((name) => /^\d+_.+\.sql$/u.test(name))
      .sort();

    expect(migrationFiles).toEqual([
      '0001_initial.sql',
      '0002_auth_and_quota_hardening.sql',
      '0003_diary_scope_and_search.sql',
    ]);

    for (const file of migrationFiles) {
      db.run(readFileSync(join(migrationsDir, file), 'utf8'));
    }

    const diaryColumns = db.exec('pragma table_info(diary_entries)')[0]?.values.map((row) => row[1]);
    expect(diaryColumns).toEqual(expect.arrayContaining(['wing', 'room', 'updated_at']));

    const diaryChunkTable = db.exec("select name from sqlite_master where type = 'table' and name = 'diary_chunks'")[0]?.values;
    expect(diaryChunkTable).toEqual([['diary_chunks']]);

    db.close();
  });
});
