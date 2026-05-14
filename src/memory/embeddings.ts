import type { AppEnv, AppConfig } from '../config';

interface EmbeddingResponse {
  shape: number[];
  data: number[][];
  pooling?: 'mean' | 'cls';
}

export async function embedTexts(env: AppEnv, config: AppConfig, texts: string[]): Promise<number[][]> {
  if (!env.AI) {
    throw new Error('Workers AI binding is unavailable');
  }
  if (texts.length === 0) {
    return [];
  }

  const response = (await env.AI.run(config.embeddingModel, {
    text: texts.length === 1 ? texts[0] : texts,
  })) as EmbeddingResponse;

  if (!Array.isArray(response?.data)) {
    throw new Error('Workers AI embedding response was malformed');
  }

  for (const vector of response.data) {
    if (!Array.isArray(vector) || vector.length !== config.embeddingDimensions) {
      throw new Error(`Embedding dimension mismatch: expected ${config.embeddingDimensions}`);
    }
  }

  return response.data;
}

export async function embedText(env: AppEnv, config: AppConfig, text: string): Promise<number[]> {
  const [vector] = await embedTexts(env, config, [text]);
  if (!vector) {
    throw new Error('Workers AI embedding response contained no vectors');
  }
  return vector;
}
