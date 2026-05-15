import type { AppEnv, AppConfig } from '../config';
import type { TunnelRecord, TenantAuthContext } from './types';
import { writeAuditLog } from './audit';
import { consumeQuotaReservation, releaseQuotaReservation, reserveQuota } from './quotas';
import { getText } from '../storage/r2';
import { queryAll, queryFirst, execute } from '../storage/d1';
import { requireBinding } from './index';
import { deterministicId } from '../utils/ids';
import { nowIso } from '../utils/time';
import { sanitizeSimpleText } from '../security/validators';

export interface CreateTunnelInput {
  source_wing: string;
  source_room: string;
  target_wing: string;
  target_room: string;
  label?: string;
  source_drawer_id?: string;
  target_drawer_id?: string;
}

export interface ListTunnelsInput {
  wing?: string;
}

export interface FollowTunnelsInput {
  wing: string;
  room: string;
}

export interface TraverseInput {
  start_room: string;
  max_hops?: number;
}

export interface FindTunnelsInput {
  wing_a?: string;
  wing_b?: string;
}

async function previewDrawer(env: AppEnv, tenantId: string, drawerId: string | null | undefined): Promise<string | null> {
  if (!drawerId) {
    return null;
  }
  const db = requireBinding(env.DB, 'DB');
  const bucket = requireBinding(env.MEMORY_BUCKET, 'MEMORY_BUCKET');
  const drawer = await queryFirst<{ r2_key: string }>(
    db,
    `select r2_key from drawers where tenant_id = ? and id = ? and deleted_at is null`,
    [tenantId, drawerId],
  );
  if (!drawer) {
    return null;
  }
  const content = (await getText(bucket, drawer.r2_key)) ?? '';
  return content.length <= 200 ? content : `${content.slice(0, 199)}…`;
}

async function requireOwnedDrawerId(env: AppEnv, tenantId: string, drawerId: string | undefined, label: string): Promise<string | null> {
  if (!drawerId) {
    return null;
  }
  const db = requireBinding(env.DB, 'DB');
  const drawer = await queryFirst<{ id: string }>(
    db,
    `select id from drawers where tenant_id = ? and id = ? and deleted_at is null`,
    [tenantId, drawerId],
  );
  if (!drawer) {
    throw new Error(`${label} must reference an existing drawer for this tenant`);
  }
  return drawerId;
}

export async function createTunnel(env: AppEnv, config: AppConfig, auth: TenantAuthContext, input: CreateTunnelInput) {
  const db = requireBinding(env.DB, 'DB');
  const reservationDay = await reserveQuota(db, config, auth.tenantId, 'memory_writes', 1);
  const sourceWing = sanitizeSimpleText(input.source_wing, 'source_wing');
  const sourceRoom = sanitizeSimpleText(input.source_room, 'source_room');
  const targetWing = sanitizeSimpleText(input.target_wing, 'target_wing');
  const targetRoom = sanitizeSimpleText(input.target_room, 'target_room');
  const label = input.label ? sanitizeSimpleText(input.label, 'label', 120) : null;
  const sourceDrawerId = await requireOwnedDrawerId(env, auth.tenantId, input.source_drawer_id, 'source_drawer_id');
  const targetDrawerId = await requireOwnedDrawerId(env, auth.tenantId, input.target_drawer_id, 'target_drawer_id');
  const createdAt = nowIso();
  const id = await deterministicId('tunnel', [auth.tenantId, sourceWing, sourceRoom, targetWing, targetRoom, label ?? '', sourceDrawerId ?? '', targetDrawerId ?? '']);
  try {
    await execute(
      db,
      `insert into tunnels(id, tenant_id, source_wing, source_room, target_wing, target_room, label, source_drawer_id, target_drawer_id, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(id) do nothing`,
      [id, auth.tenantId, sourceWing, sourceRoom, targetWing, targetRoom, label, sourceDrawerId, targetDrawerId, createdAt],
    );
    await consumeQuotaReservation(db, auth.tenantId, 'memory_writes', 1, reservationDay);
    await writeAuditLog(db, auth.tenantId, 'create_tunnel', input, { success: true, tunnel_id: id });
    return {
      success: true,
      tunnel_id: id,
      source: { wing: sourceWing, room: sourceRoom },
      target: { wing: targetWing, room: targetRoom },
      label,
      id,
    };
  } catch (error) {
    await releaseQuotaReservation(db, auth.tenantId, 'memory_writes', 1, reservationDay);
    throw error;
  }
}

export async function listTunnels(env: AppEnv, auth: TenantAuthContext, input: ListTunnelsInput) {
  const db = requireBinding(env.DB, 'DB');
  const filters = ['tenant_id = ?'];
  const values: unknown[] = [auth.tenantId];
  if (input.wing) {
    const wing = sanitizeSimpleText(input.wing, 'wing');
    filters.push('(source_wing = ? or target_wing = ?)');
    values.push(wing, wing);
  }
  const tunnels = await queryAll<TunnelRecord>(
    db,
    `select id, tenant_id, source_wing, source_room, target_wing, target_room, label, source_drawer_id, target_drawer_id, created_at
       from tunnels
      where ${filters.join(' and ')}
      order by created_at desc`,
    values,
  );
  return { tunnels, count: tunnels.length };
}

export async function deleteTunnel(env: AppEnv, config: AppConfig, auth: TenantAuthContext, tunnelId: string) {
  const db = requireBinding(env.DB, 'DB');
  const reservationDay = await reserveQuota(db, config, auth.tenantId, 'memory_writes', 1);
  try {
    await execute(db, `delete from tunnels where tenant_id = ? and id = ?`, [auth.tenantId, tunnelId]);
    await consumeQuotaReservation(db, auth.tenantId, 'memory_writes', 1, reservationDay);
    await writeAuditLog(db, auth.tenantId, 'delete_tunnel', { tunnel_id: tunnelId }, { success: true });
    return { success: true, tunnel_id: tunnelId, deleted: tunnelId };
  } catch (error) {
    await releaseQuotaReservation(db, auth.tenantId, 'memory_writes', 1, reservationDay);
    throw error;
  }
}

export async function followTunnels(env: AppEnv, auth: TenantAuthContext, input: FollowTunnelsInput) {
  const db = requireBinding(env.DB, 'DB');
  const wing = sanitizeSimpleText(input.wing, 'wing');
  const room = sanitizeSimpleText(input.room, 'room');
  const tunnels = await queryAll<TunnelRecord>(
    db,
    `select id, tenant_id, source_wing, source_room, target_wing, target_room, label, source_drawer_id, target_drawer_id, created_at
       from tunnels
      where tenant_id = ? and ((source_wing = ? and source_room = ?) or (target_wing = ? and target_room = ?))
      order by created_at desc`,
    [auth.tenantId, wing, room, wing, room],
  );

  const results = [] as Array<Record<string, unknown>>;
  for (const tunnel of tunnels) {
    const outgoing = tunnel.source_wing === wing && tunnel.source_room === room;
    const drawerPreview = outgoing
      ? await previewDrawer(env, auth.tenantId, tunnel.target_drawer_id)
      : await previewDrawer(env, auth.tenantId, tunnel.source_drawer_id);
    results.push({
      direction: outgoing ? 'outgoing' : 'incoming',
      connected_wing: outgoing ? tunnel.target_wing : tunnel.source_wing,
      connected_room: outgoing ? tunnel.target_room : tunnel.source_room,
      label: tunnel.label,
      drawer_id: outgoing ? tunnel.target_drawer_id : tunnel.source_drawer_id,
      tunnel_id: tunnel.id,
      drawer_preview: drawerPreview,
    });
  }
  return results;
}

export async function findTunnels(env: AppEnv, auth: TenantAuthContext, input: FindTunnelsInput) {
  const db = requireBinding(env.DB, 'DB');
  const values: unknown[] = [auth.tenantId];
  const filters = ['tenant_id = ?', 'deleted_at is null'];
  if (input.wing_a) {
    filters.push('wing = ?');
    values.push(sanitizeSimpleText(input.wing_a, 'wing_a'));
  }
  const roomRows = await queryAll<{ room: string; wings: number; count: number; recent: string }>(
    db,
    `select room, count(distinct wing) as wings, count(*) as count, max(updated_at) as recent
       from drawers
      where ${filters.join(' and ')}
      group by room
     having count(distinct wing) > 1
      order by wings desc, count desc, recent desc`,
    values,
  );

  const results = [] as Array<Record<string, unknown>>;
  for (const row of roomRows) {
    const wings = await queryAll<{ wing: string }>(
      db,
      `select distinct wing from drawers where tenant_id = ? and deleted_at is null and room = ? order by wing asc`,
      [auth.tenantId, row.room],
    );
    const wingNames = wings.map((item) => item.wing);
    if (input.wing_b && !wingNames.includes(sanitizeSimpleText(input.wing_b, 'wing_b'))) {
      continue;
    }
    results.push({ room: row.room, wings: wingNames, halls: [], count: row.count, recent: row.recent });
  }
  return { tunnels: results, count: results.length };
}

function nodeKey(wing: string, room: string): string {
  return `${wing}::${room}`;
}

export async function traverse(env: AppEnv, auth: TenantAuthContext, input: TraverseInput) {
  const db = requireBinding(env.DB, 'DB');
  const startRoom = sanitizeSimpleText(input.start_room, 'start_room');
  const maxHops = Math.min(Math.max(1, input.max_hops ?? 3), 10);
  const roomRows = await queryAll<{ wing: string; room: string }>(
    db,
    `select distinct wing, room from drawers where tenant_id = ? and deleted_at is null`,
    [auth.tenantId],
  );
  const tunnels = await queryAll<TunnelRecord>(
    db,
    `select id, tenant_id, source_wing, source_room, target_wing, target_room, label, source_drawer_id, target_drawer_id, created_at
       from tunnels where tenant_id = ?`,
    [auth.tenantId],
  );

  const adjacency = new Map<string, Set<string>>();
  const roomGroups = new Map<string, Set<string>>();
  for (const row of roomRows) {
    roomGroups.set(row.room, roomGroups.get(row.room) ?? new Set());
    roomGroups.get(row.room)?.add(row.wing);
    const key = nodeKey(row.wing, row.room);
    adjacency.set(key, adjacency.get(key) ?? new Set());
  }
  for (const row of roomRows) {
    const sameRoom = roomRows.filter((candidate) => candidate.room === row.room && candidate.wing !== row.wing);
    for (const neighbor of sameRoom) {
      adjacency.get(nodeKey(row.wing, row.room))?.add(nodeKey(neighbor.wing, neighbor.room));
    }
  }
  for (const tunnel of tunnels) {
    adjacency.get(nodeKey(tunnel.source_wing, tunnel.source_room))?.add(nodeKey(tunnel.target_wing, tunnel.target_room));
    adjacency.get(nodeKey(tunnel.target_wing, tunnel.target_room))?.add(nodeKey(tunnel.source_wing, tunnel.source_room));
  }

  const queue = roomRows.filter((row) => row.room === startRoom).map((row) => ({ key: nodeKey(row.wing, row.room), hop: 0 }));
  const seen = new Set(queue.map((item) => item.key));
  const results = [] as Array<Record<string, unknown>>;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    const [wing = '', room = ''] = current.key.split('::');
    results.push({ room, wings: Array.from(roomGroups.get(room) ?? new Set([wing])), halls: [], count: (roomGroups.get(room) ?? new Set()).size, hop: current.hop });
    if (current.hop >= maxHops) {
      continue;
    }
    for (const neighbor of adjacency.get(current.key) ?? []) {
      if (!seen.has(neighbor)) {
        seen.add(neighbor);
        queue.push({ key: neighbor, hop: current.hop + 1 });
      }
    }
  }

  return { start_room: startRoom, max_hops: maxHops, results };
}

export async function graphStats(env: AppEnv, _config: AppConfig, auth: TenantAuthContext) {
  const db = requireBinding(env.DB, 'DB');
  const totalRooms = await queryFirst<{ total: number }>(
    db,
    `select count(distinct wing || ':' || room) as total from drawers where tenant_id = ? and deleted_at is null`,
    [auth.tenantId],
  );
  const tunnelRooms = await queryFirst<{ total: number }>(
    db,
    `select count(distinct source_wing || ':' || source_room) + count(distinct target_wing || ':' || target_room) as total from tunnels where tenant_id = ?`,
    [auth.tenantId],
  );
  const edges = await queryFirst<{ total: number }>(db, `select count(*) as total from tunnels where tenant_id = ?`, [auth.tenantId]);
  const roomsPerWing = await queryAll<{ wing: string; count: number }>(
    db,
    `select wing, count(distinct room) as count from drawers where tenant_id = ? and deleted_at is null group by wing order by wing asc`,
    [auth.tenantId],
  );
  const topTunnels = await findTunnels(env, auth, {});
  return {
    total_rooms: totalRooms?.total ?? 0,
    tunnel_rooms: tunnelRooms?.total ?? 0,
    total_edges: edges?.total ?? 0,
    rooms_per_wing: Object.fromEntries(roomsPerWing.map((row) => [row.wing, row.count])),
    top_tunnels: topTunnels.tunnels.slice(0, 10),
  };
}

export async function localToolStatus(env: AppEnv, _config: AppConfig, auth: TenantAuthContext) {
  const db = requireBinding(env.DB, 'DB');
  const latestWrite = await queryFirst<{ count: number; latest: string | null }>(
    db,
    `select count(*) as count, max(created_at) as latest from write_audit_log where tenant_id = ?`,
    [auth.tenantId],
  );
  return {
    status: latestWrite?.count ? 'ok' : 'quiet',
    message: latestWrite?.count ? 'Recent memory writes were filed away in Cloudflare storage.' : 'No recent memory writes are recorded for this tenant yet.',
    count: latestWrite?.count ?? 0,
    timestamp: latestWrite?.latest,
    cloud_mode: true,
    note: 'Local hook checkpoint files do not exist in the Cloudflare deployment.',
  };
}
