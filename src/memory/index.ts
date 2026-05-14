import type { AppConfig, AppEnv } from '../config';
import type { TenantAuthContext } from './types';

export interface ServiceContext {
  env: AppEnv;
  config: AppConfig;
  auth: TenantAuthContext;
}

export function requireBinding<T>(value: T | undefined, label: string): T {
  if (!value) {
    throw new Error(`Missing required binding ${label}`);
  }
  return value;
}
