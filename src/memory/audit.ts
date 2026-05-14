import type { D1DatabaseLike } from '../config';
import { execute } from '../storage/d1';
import { deterministicId } from '../utils/ids';
import { stableStringify } from '../utils/json';
import { nowIso } from '../utils/time';
import { redactObject } from '../security/redact';

export async function writeAuditLog(
  db: D1DatabaseLike,
  tenantId: string,
  operation: string,
  params: unknown,
  result?: unknown,
): Promise<void> {
  const createdAt = nowIso();
  const id = await deterministicId('audit', [tenantId, operation, createdAt, params]);
  const normalizedParams = toRecord(params);
  const normalizedResult = result === undefined ? undefined : toRecord(result);
  await execute(
    db,
    `insert into write_audit_log(id, tenant_id, operation, redacted_params_json, result_json, created_at)
     values (?, ?, ?, ?, ?, ?)`,
    [
      id,
      tenantId,
      operation,
      stableStringify(redactObject(normalizedParams)),
      normalizedResult ? stableStringify(redactObject(normalizedResult)) : null,
      createdAt,
    ],
  );
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}
