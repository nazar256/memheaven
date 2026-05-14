import type { AppEnv } from '../config';
import { getConfigDiagnostics } from '../config';
import { describeVectorIndex } from '../memory/vectorizeIndex';
import { jsonResponse } from '../oauth/metadata';

export async function handleHealth(env: AppEnv): Promise<Response> {
  const diagnostics = getConfigDiagnostics(env);
  let vectorize: Record<string, unknown> | null = null;

  if (diagnostics.bindingStatus.vectorize && env.VECTORIZE) {
    try {
      const info = await describeVectorIndex(env);
      vectorize = {
        dimensions: info.dimensions,
        vectorCount: info.vectorCount ?? null,
        processedUpToDatetime: info.processedUpToDatetime ?? null,
        processedUpToMutation: info.processedUpToMutation ?? null,
      };
    } catch (error) {
      diagnostics.warnings.push({
        code: 'vectorize_describe_failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return jsonResponse(
    {
      ok: diagnostics.ok,
      bindings: diagnostics.bindingStatus,
      errors: diagnostics.errors,
      warnings: diagnostics.warnings,
      oauth: diagnostics.config
        ? {
            issuer: diagnostics.config.issuer,
            resource: diagnostics.config.mcpResource,
            audience: diagnostics.config.mcpAudience,
          }
        : {
            issuer: env.OAUTH_ISSUER ?? null,
            resource: env.MCP_RESOURCE ?? null,
            audience: env.MCP_AUDIENCE ?? null,
          },
      quotas: diagnostics.config
        ? {
            daily_max_mcp_calls_per_tenant: diagnostics.config.dailyMaxMcpCallsPerTenant,
            daily_max_writes_per_tenant: diagnostics.config.dailyMaxWritesPerTenant,
            daily_max_vector_queries_per_tenant: diagnostics.config.dailyMaxVectorQueriesPerTenant,
            daily_max_embedding_input_chars_per_tenant: diagnostics.config.dailyMaxEmbeddingInputCharsPerTenant,
          }
        : null,
      backend: diagnostics.config?.backendCapabilities ?? null,
      vectorize,
    },
    diagnostics.ok ? 200 : 503,
  );
}
