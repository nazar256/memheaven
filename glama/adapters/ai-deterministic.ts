import type { AiBindingLike } from '../../src/config';

/**
 * Deterministic, dependency-free embedding substitute for inspection only.
 * It intentionally provides stable vectors rather than production-equivalent
 * semantic quality.
 */
export class DeterministicAiBinding implements AiBindingLike {
  public constructor(public readonly dimensions = 384) {}

  async run(_model: string, inputs: Record<string, unknown>): Promise<unknown> {
    const texts = Array.isArray(inputs.text)
      ? inputs.text.map((text) => String(text))
      : [String(inputs.text ?? '')];
    return {
      shape: [texts.length, this.dimensions],
      data: texts.map((text) => deterministicEmbedding(text, this.dimensions)),
    };
  }
}

export function deterministicEmbedding(text: string, dimensions = 384): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  for (let index = 0; index < text.length; index += 1) {
    vector[index % dimensions]! += text.charCodeAt(index) / 255;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) {
    return vector;
  }
  return vector.map((value) => value / magnitude);
}
