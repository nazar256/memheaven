import type { R2BucketLike, R2ObjectLike } from '../../src/config';

/** Ephemeral text-only R2 substitute for Glama inspection. */
export class MemoryR2Bucket implements R2BucketLike {
  public readonly objects = new Map<string, string>();

  async get(key: string): Promise<R2ObjectLike | null> {
    const value = this.objects.get(key);
    if (value === undefined) {
      return null;
    }
    return {
      body: { text: async () => value },
      text: async () => value,
    };
  }

  async put(key: string, value: string): Promise<void> {
    this.objects.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}
