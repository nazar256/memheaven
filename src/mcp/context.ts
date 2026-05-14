import type { AppConfig, AppEnv } from '../config';
import { requireConfig } from '../config';
import type { TenantAuthContext } from '../memory/types';
import { authenticateBearerRequest } from '../oauth/token';

export interface McpRequestContext {
  config: AppConfig;
  auth: TenantAuthContext;
}

export function requireScope(auth: TenantAuthContext, scope: string): void {
  if (!auth.scopes.includes(scope)) {
    throw new Error(`This tool requires the ${scope} scope`);
  }
}

export async function requireAuthenticatedMcpContext(request: Request, env: AppEnv): Promise<McpRequestContext> {
  const config = requireConfig(env);
  const auth = await authenticateBearerRequest(request, config);
  if (!auth) {
    throw new Error('Missing bearer token');
  }
  return { config, auth };
}
