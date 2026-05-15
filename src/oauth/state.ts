import type { D1DatabaseLike } from '../config';
import { execute, executeResult, queryFirst } from '../storage/d1';

interface AuthRateLimitRow {
  window_started_at: number;
  count: number;
}

interface RefreshSessionRow {
  session_id: string;
  revoked_at: number | null;
}

export class OAuthInvalidGrantError extends Error {
  constructor(message = 'The provided grant is invalid or expired') {
    super(message);
    this.name = 'OAuthInvalidGrantError';
  }
}

export class OAuthRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('Too many authentication attempts; try again shortly');
    this.name = 'OAuthRateLimitError';
  }
}

function unixNow(date = new Date()): number {
  return Math.floor(date.getTime() / 1000);
}

function statementChanges(result: { meta?: Record<string, unknown> } | undefined): number {
  const changes = result?.meta?.changes;
  return typeof changes === 'number' ? changes : 0;
}

export async function enforceAuthFlowRateLimit(
  db: D1DatabaseLike,
  scope: 'register' | 'authorize_post' | 'token',
  clientIp: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const now = unixNow();
  const windowStartedAt = now - (now % windowSeconds);
  const bucket = `${scope}:${clientIp}`;
  const result = await executeResult(
    db,
    `insert into auth_rate_limits(bucket, window_started_at, count)
     values (?, ?, 1)
     on conflict(bucket) do update set
       window_started_at = excluded.window_started_at,
       count = case
         when auth_rate_limits.window_started_at = excluded.window_started_at then auth_rate_limits.count + 1
         else 1
       end
     where auth_rate_limits.window_started_at != excluded.window_started_at or auth_rate_limits.count < ?`,
    [bucket, windowStartedAt, limit],
  );

  if (statementChanges(result) > 0) {
    return;
  }

  const row = await queryFirst<AuthRateLimitRow>(
    db,
    `select window_started_at, count from auth_rate_limits where bucket = ?`,
    [bucket],
  );
  const retryAfterSeconds = Math.max(1, windowSeconds - (now - (row?.window_started_at ?? windowStartedAt)));
  throw new OAuthRateLimitError(retryAfterSeconds);
}

export async function consumeAuthorizationCode(
  db: D1DatabaseLike,
  jti: string,
  clientId: string,
  expiresAt: number,
): Promise<void> {
  const consumedAt = unixNow();
  const result = await executeResult(
    db,
    `insert into oauth_authorization_codes(jti, client_id, expires_at, consumed_at)
     values (?, ?, ?, ?)
     on conflict(jti) do nothing`,
    [jti, clientId, expiresAt, consumedAt],
  );
  if (statementChanges(result) === 0) {
    throw new OAuthInvalidGrantError('Authorization code is invalid or expired');
  }
}

export async function createRefreshSession(
  db: D1DatabaseLike,
  input: {
    sessionId: string;
    tenantId: string;
    clientId: string;
    subject: string;
    expiresAt: number;
  },
): Promise<void> {
  await execute(
    db,
    `insert into oauth_refresh_sessions(session_id, tenant_id, client_id, subject, expires_at, revoked_at)
     values (?, ?, ?, ?, ?, null)`,
    [input.sessionId, input.tenantId, input.clientId, input.subject, input.expiresAt],
  );
}

export async function storeRefreshToken(
  db: D1DatabaseLike,
  input: {
    jti: string;
    sessionId: string;
    clientId: string;
    parentJti: string | null;
    expiresAt: number;
  },
): Promise<void> {
  await execute(
    db,
    `insert into oauth_refresh_tokens(jti, session_id, client_id, parent_jti, expires_at, consumed_at, replaced_by_jti)
     values (?, ?, ?, ?, ?, null, null)`,
    [input.jti, input.sessionId, input.clientId, input.parentJti, input.expiresAt],
  );
}

export async function rotateRefreshToken(
  db: D1DatabaseLike,
  input: {
    sessionId: string;
    clientId: string;
    presentedJti: string;
    nextJti: string;
    expiresAt: number;
  },
): Promise<void> {
  const session = await queryFirst<RefreshSessionRow>(
    db,
    `select session_id, revoked_at from oauth_refresh_sessions where session_id = ?`,
    [input.sessionId],
  );
  if (!session || session.revoked_at) {
    throw new OAuthInvalidGrantError('Refresh token is invalid or expired');
  }

  const consumedAt = unixNow();
  const consumeResult = await executeResult(
    db,
    `update oauth_refresh_tokens
        set consumed_at = ?, replaced_by_jti = ?
      where jti = ? and session_id = ? and client_id = ? and consumed_at is null`,
    [consumedAt, input.nextJti, input.presentedJti, input.sessionId, input.clientId],
  );

  if (statementChanges(consumeResult) === 0) {
    await revokeRefreshSession(db, input.sessionId, consumedAt);
    throw new OAuthInvalidGrantError('Refresh token is invalid or expired');
  }

  await storeRefreshToken(db, {
    jti: input.nextJti,
    sessionId: input.sessionId,
    clientId: input.clientId,
    parentJti: input.presentedJti,
    expiresAt: input.expiresAt,
  });
}

async function revokeRefreshSession(db: D1DatabaseLike, sessionId: string, revokedAt: number): Promise<void> {
  await execute(
    db,
    `update oauth_refresh_sessions
        set revoked_at = coalesce(revoked_at, ?)
      where session_id = ?`,
    [revokedAt, sessionId],
  );
}
