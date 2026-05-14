import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker';

import type { AppConfig, AppEnv } from '../config';
import type { TenantAuthContext } from '../memory/types';
import { memoryProtocolLines } from '../memory/drawers';
import { registerMemPalaceTools } from './tools';

export function createMcpServer(env: AppEnv, config: AppConfig, auth: TenantAuthContext): McpServer {
  const server = new McpServer(
    {
      name: 'memheaven',
      title: 'MemHeaven',
      version: '0.1.0',
      description: 'Cloudflare-native MemPalace-compatible remote MCP server.',
    },
    {
      capabilities: {
        logging: {},
      },
      instructions: memoryProtocolLines().join(' '),
      jsonSchemaValidator: new CfWorkerJsonSchemaValidator(),
    },
  );

  registerMemPalaceTools(server, { env, config, auth });
  return server;
}
