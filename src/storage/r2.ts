import type { R2BucketLike } from '../config';

export async function putText(bucket: R2BucketLike, key: string, content: string): Promise<void> {
  await bucket.put(key, content, { httpMetadata: { contentType: 'text/markdown; charset=utf-8' } });
}

export async function getText(bucket: R2BucketLike, key: string): Promise<string | null> {
  const object = await bucket.get(key);
  if (!object) {
    return null;
  }
  if (typeof object.text === 'function') {
    return object.text();
  }
  return object.body ? object.body.text() : null;
}

export async function deleteText(bucket: R2BucketLike, key: string): Promise<void> {
  await bucket.delete(key);
}
