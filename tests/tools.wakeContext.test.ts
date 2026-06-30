import { describe, expect, it } from 'vitest';

import { requireConfig } from '../src/config';
import { addDrawer } from '../src/memory/drawers';
import { diaryWrite } from '../src/memory/diary';
import { wakeContext } from '../src/memory/wakeContext';
import { createEnvWithKeys, mintDirectAccessToken, verifyDirectAccessToken } from './helpers/testData';

describe('wake context tool', async () => {
  it('loads only curated global-safe drawers in global mode', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const auth = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));

    await addDrawer(env, config, auth, { wing: 'global', room: 'profile', content: 'Yurii prefers direct, explicit behavior in assistant responses.' });
    await addDrawer(env, config, auth, { wing: 'global', room: 'scratch', content: 'Do not load this non-curated global scratch note.' });
    await addDrawer(env, config, auth, { wing: 'work', room: 'memheaven', content: 'Project-only MemHeaven roadmap detail must not leak into global wake.' });

    const result = await wakeContext(env, config, auth, { mode: 'global', max_items: 10, max_chars: 5000 });

    expect(result.mode).toBe('global');
    expect(result.scope).toBeNull();
    expect(result.context_items).toHaveLength(1);
    expect(result.context_items[0]?.wing).toBe('global');
    expect(result.context_items[0]?.room).toBe('profile');
    expect(result.context_items[0]?.text).toContain('direct, explicit behavior');
    expect(JSON.stringify(result)).not.toContain('roadmap detail');
    expect(JSON.stringify(result)).not.toContain('scratch note');
    expect(result.withheld).toContain('Project-scoped memories were not inspected.');
  });

  it('requires explicit scoped wing and never widens to other scopes', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const auth = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));

    await addDrawer(env, config, auth, { wing: 'work', room: 'memheaven', content: 'MemHeaven scoped context: wake context must stay inside the requested wing and room.' });
    await addDrawer(env, config, auth, { wing: 'work', room: 'other', content: 'Other work room should not load when room is explicit.' });
    await addDrawer(env, config, auth, { wing: 'personal', room: 'memheaven', content: 'Personal context should not leak into work scope.' });

    await expect(wakeContext(env, config, auth, { mode: 'scoped' })).rejects.toThrow('wing is required');

    const scoped = await wakeContext(env, config, auth, { mode: 'scoped', wing: 'work', room: 'memheaven', max_items: 5, max_chars: 40 });
    expect(scoped.scope).toEqual({ wing: 'work', room: 'memheaven' });
    expect(scoped.context_items).toHaveLength(1);
    expect(scoped.context_items[0]?.text).toContain('MemHeaven scoped context');
    expect(scoped.context_items[0]?.text.length).toBeLessThanOrEqual(40);
    expect(scoped.context_items[0]?.truncated).toBe(true);
    expect(JSON.stringify(scoped)).not.toContain('Other work room');
    expect(JSON.stringify(scoped)).not.toContain('Personal context');

    const empty = await wakeContext(env, config, auth, { mode: 'scoped', wing: 'missing-wing', max_items: 5 });
    expect(empty.context_items).toHaveLength(0);
    expect(JSON.stringify(empty)).not.toContain('MemHeaven scoped context');
  });

  it('preserves tenant isolation and does not include diary entries', async () => {
    const env = await createEnvWithKeys();
    const config = requireConfig(env);
    const tenantA = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-a'));
    const tenantB = await verifyDirectAccessToken(env, await mintDirectAccessToken(env, 'tenant-b'));

    await addDrawer(env, config, tenantA, { wing: 'work', room: 'memheaven', content: 'Tenant A scoped drawer should stay private.' });
    await diaryWrite(env, config, tenantA, { agent_name: 'ChatGPT', topic: 'memheaven', entry: 'Diary-only text must not appear in wake context.' });

    const tenantBScoped = await wakeContext(env, config, tenantB, { mode: 'scoped', wing: 'work', room: 'memheaven' });
    expect(tenantBScoped.context_items).toHaveLength(0);

    const tenantAScoped = await wakeContext(env, config, tenantA, { mode: 'scoped', wing: 'work', room: 'memheaven' });
    expect(JSON.stringify(tenantAScoped)).toContain('Tenant A scoped drawer');
    expect(JSON.stringify(tenantAScoped)).not.toContain('Diary-only text');
    expect(tenantAScoped.withheld).toContain('Diary entries were not loaded; use diary tools with an explicit agent_name when session continuity matters.');
  });
});
