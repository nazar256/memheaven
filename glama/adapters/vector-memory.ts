import type {
  VectorizeIndexInfo,
  VectorizeIndexLike,
  VectorizeMatch,
  VectorizeMatches,
  VectorizeMutation,
  VectorizeVector,
} from '../../src/config';

function cloneVector(vector: VectorizeVector): VectorizeVector {
  const clone: VectorizeVector = {
    id: vector.id,
    values: Array.from(vector.values),
  };
  if (vector.namespace !== undefined) {
    clone.namespace = vector.namespace;
  }
  if (vector.metadata !== undefined) {
    clone.metadata = { ...vector.metadata };
  }
  return clone;
}

function cosineSimilarity(left: number[], right: number[]): number {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }
  const denominator = Math.sqrt(leftMagnitude * rightMagnitude);
  return denominator === 0 ? 0 : dot / denominator;
}

function matchesFilter(metadata: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (Array.isArray(expected)) {
      return expected.includes(metadata[key]);
    }
    return metadata[key] === expected;
  });
}

/** Ephemeral brute-force Vectorize substitute for Glama inspection. */
export class MemoryVectorizeIndex implements VectorizeIndexLike {
  public readonly vectors = new Map<string, VectorizeVector>();
  private mutationCounter = 0;

  public constructor(public readonly dimensions = 384) {}

  async describe(): Promise<VectorizeIndexInfo> {
    return { dimensions: this.dimensions, vectorCount: this.vectors.size };
  }

  async query(vector: number[] | Float32Array | Float64Array, options: Record<string, unknown> = {}): Promise<VectorizeMatches> {
    const queryVector = Array.from(vector);
    if (queryVector.length !== this.dimensions) {
      throw new Error(`Vector dimension mismatch: expected ${this.dimensions}`);
    }
    const topKValue = Number(options.topK ?? 5);
    const topK = Number.isFinite(topKValue) ? Math.max(0, Math.floor(topKValue)) : 5;
    const namespace = typeof options.namespace === 'string' ? options.namespace : undefined;
    const filter = (options.filter as Record<string, unknown> | undefined) ?? {};
    const matches = [...this.vectors.values()]
      .filter((candidate) => namespace === undefined || candidate.namespace === namespace)
      .filter((candidate) => matchesFilter(candidate.metadata ?? {}, filter))
      .map((candidate) => {
        const match: VectorizeMatch = {
          id: candidate.id,
          score: cosineSimilarity(queryVector, Array.from(candidate.values)),
          metadata: candidate.metadata ? { ...candidate.metadata } : {},
        };
        if (candidate.namespace !== undefined) {
          match.namespace = candidate.namespace;
        }
        return match;
      })
      .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
      .slice(0, topK);
    return { count: matches.length, matches };
  }

  async upsert(vectors: VectorizeVector[]): Promise<VectorizeMutation> {
    for (const vector of vectors) {
      if (vector.values.length !== this.dimensions) {
        throw new Error(`Vector dimension mismatch: expected ${this.dimensions}`);
      }
    }
    for (const vector of vectors) {
      this.vectors.set(vector.id, cloneVector(vector));
    }
    return { mutationId: `upsert-${++this.mutationCounter}` };
  }

  async deleteByIds(ids: string[]): Promise<VectorizeMutation> {
    for (const id of ids) {
      this.vectors.delete(id);
    }
    return { mutationId: `delete-${++this.mutationCounter}` };
  }

  async getByIds(ids: string[]): Promise<VectorizeVector[]> {
    return ids.flatMap((id) => {
      const vector = this.vectors.get(id);
      return vector ? [cloneVector(vector)] : [];
    });
  }
}

export { cosineSimilarity };
