import { z } from 'zod';

export const listRoomsSchema = {
  wing: z.string().optional(),
};

export const searchSchema = {
  query: z.string().min(1).max(250),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  wing: z.string().optional(),
  room: z.string().optional(),
  max_distance: z.coerce.number().min(0).max(2).optional(),
  context: z.string().optional(),
};

export const duplicateSchema = {
  content: z.string().min(1),
  threshold: z.coerce.number().min(0).max(1).optional(),
};

export const addDrawerSchema = {
  wing: z.string().min(1),
  room: z.string().min(1),
  content: z.string().min(1),
  source_file: z.string().optional(),
  added_by: z.string().optional(),
};

export const updateDrawerSchema = {
  drawer_id: z.string().min(1),
  content: z.string().optional(),
  wing: z.string().optional(),
  room: z.string().optional(),
  source_file: z.string().optional(),
  added_by: z.string().optional(),
  force_reindex: z.boolean().optional(),
};

export const deleteDrawerSchema = {
  drawer_id: z.string().min(1),
};

export const getDrawerSchema = {
  drawer_id: z.string().min(1),
};

export const listDrawersSchema = {
  wing: z.string().optional(),
  room: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
};

export const kgQuerySchema = {
  entity: z.string().min(1),
  as_of: z.string().optional(),
  direction: z.enum(['outgoing', 'incoming', 'both']).optional(),
};

export const kgAddSchema = {
  subject: z.string().min(1),
  predicate: z.string().min(1),
  object: z.string().min(1),
  valid_from: z.string().optional(),
  valid_to: z.string().optional(),
  confidence: z.coerce.number().min(0).max(1).optional(),
  source_drawer_id: z.string().optional(),
  source_closet: z.string().optional(),
  source_file: z.string().optional(),
};

export const kgInvalidateSchema = {
  subject: z.string().min(1),
  predicate: z.string().min(1),
  object: z.string().min(1),
  ended: z.string().optional(),
};

export const kgTimelineSchema = {
  entity: z.string().optional(),
};

export const traverseSchema = {
  start_room: z.string().min(1),
  max_hops: z.coerce.number().int().min(1).max(10).optional(),
};

export const findTunnelsSchema = {
  wing_a: z.string().optional(),
  wing_b: z.string().optional(),
};

export const createTunnelSchema = {
  source_wing: z.string().min(1),
  source_room: z.string().min(1),
  target_wing: z.string().min(1),
  target_room: z.string().min(1),
  label: z.string().optional(),
  source_drawer_id: z.string().optional(),
  target_drawer_id: z.string().optional(),
};

export const listTunnelsSchema = {
  wing: z.string().optional(),
};

export const deleteTunnelSchema = {
  tunnel_id: z.string().min(1),
};

export const followTunnelsSchema = {
  wing: z.string().min(1),
  room: z.string().min(1),
};

export const diaryWriteSchema = {
  agent_name: z.string().min(1),
  entry: z.string().min(1),
  topic: z.string().optional(),
  wing: z.string().optional(),
};

export const diaryReadSchema = {
  agent_name: z.string().min(1),
  last_n: z.coerce.number().int().min(1).max(100).optional(),
  wing: z.string().optional(),
};

export const hookSettingsSchema = {
  silent_save: z.boolean().optional(),
  desktop_toast: z.boolean().optional(),
};

export const syncSchema = {
  project_dir: z.string().optional(),
  wing: z.string().optional(),
  apply: z.boolean().optional(),
};
