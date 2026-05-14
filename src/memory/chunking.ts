import type { ChunkedText } from './types';

export interface ChunkingOptions {
  targetTokens?: number;
  overlapTokens?: number;
  charsPerToken?: number;
}

const DEFAULT_TARGET_TOKENS = 400;
const DEFAULT_OVERLAP_TOKENS = 40;
const DEFAULT_CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string, charsPerToken = DEFAULT_CHARS_PER_TOKEN): number {
  return Math.max(1, Math.ceil(text.length / charsPerToken));
}

export function chunkText(text: string, options: ChunkingOptions = {}): ChunkedText[] {
  const targetTokens = options.targetTokens ?? DEFAULT_TARGET_TOKENS;
  const overlapTokens = options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS;
  const charsPerToken = options.charsPerToken ?? DEFAULT_CHARS_PER_TOKEN;
  const targetChars = targetTokens * charsPerToken;
  const overlapChars = overlapTokens * charsPerToken;

  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  if (normalized.length <= targetChars) {
    return [{ chunkIndex: 0, text: normalized, charCount: normalized.length }];
  }

  const chunks: ChunkedText[] = [];
  let cursor = 0;
  let chunkIndex = 0;

  while (cursor < normalized.length) {
    let end = Math.min(normalized.length, cursor + targetChars);
    if (end < normalized.length) {
      const paragraphBreak = normalized.lastIndexOf('\n\n', end);
      const sentenceBreak = normalized.lastIndexOf('. ', end);
      const wordBreak = normalized.lastIndexOf(' ', end);
      const preferred = [paragraphBreak, sentenceBreak, wordBreak].find(
        (candidate) => candidate !== -1 && candidate > cursor + Math.floor(targetChars * 0.6),
      );
      if (preferred && preferred > cursor) {
        end = preferred + (normalized.startsWith('\n\n', preferred) ? 0 : 1);
      }
    }

    const chunk = normalized.slice(cursor, end).trim();
    if (chunk) {
      chunks.push({ chunkIndex, text: chunk, charCount: chunk.length });
      chunkIndex += 1;
    }
    if (end >= normalized.length) {
      break;
    }
    cursor = Math.max(cursor + 1, end - overlapChars);
  }

  return chunks;
}
