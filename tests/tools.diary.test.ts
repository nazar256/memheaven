import { describe, expect, it } from 'vitest';

import { requireConfig } from '../src/config';
import { diaryRead, diaryWrite } from '../src/memory/diary';
import { createEnvWithKeys, mintDirectAccessToken, verifyDirectAccessToken } from './helpers/testData';

describe('diary tools', async () => {
  it('writes and reads recent diary entries', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const auth = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));

    const first = await diaryWrite(env, config, auth, {
      agent_name: 'ChatGPT',
      topic: 'preferences',
      entry: 'Yurii prefers concise answers with explicit behavior.',
    });
    const second = await diaryWrite(env, config, auth, {
      agent_name: 'ChatGPT',
      topic: 'project',
      entry: 'MemHeaven is a Cloudflare-native port of MemPalace.',
    });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);

    const entries = await diaryRead(env, config, auth, { agent_name: 'chatgpt', last_n: 2 });
    expect(entries.total).toBe(2);
    expect(entries.showing).toBe(2);
    expect(entries.entries[0]?.content).toContain('MemHeaven');
    expect(entries.entries[1]?.content).toContain('concise answers');
  });
});
