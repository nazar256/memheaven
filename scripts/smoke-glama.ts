import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const mode = process.argv[2] ?? 'local';
const image = process.argv[3] ?? 'memheaven-glama:smoke';

const containerRuntime = mode === 'podman' ? 'podman' : 'docker';
const server = mode === 'docker' || mode === 'podman'
  ? { command: containerRuntime, args: ['run', '--rm', '-i', image], stderr: 'pipe' as const }
  : {
      command: process.execPath,
      args: ['node_modules/tsx/dist/cli.mjs', 'glama/server.ts'],
      cwd: process.cwd(),
      stderr: 'pipe' as const,
    };

const transport = new StdioClientTransport(server);
transport.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk));
const client = new Client({ name: 'glama-stdio-smoke', version: '1.0.0' });

try {
  await client.connect(transport);
  const listed = await client.listTools();
  if (listed.tools.length !== 34) {
    throw new Error(`Expected 34 tools, received ${listed.tools.length}`);
  }
  const status = await client.callTool({ name: 'mempalace_status', arguments: {} });
  if (status.isError) {
    throw new Error('mempalace_status returned an error');
  }
  console.error(`Glama ${mode} stdio smoke passed: ${listed.tools.length} tools`);
} finally {
  await client.close().catch(() => undefined);
}
