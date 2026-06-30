import { describe, expect, it } from 'vitest';

import { loadMemoryBehaviorFixture, validateMemoryBehaviorFixture } from '../scripts/eval-local';

describe('memory behavior eval fixture', () => {
  it('is internally consistent and non-trivial', async () => {
    const fixture = await loadMemoryBehaviorFixture();

    expect(() => validateMemoryBehaviorFixture(fixture)).not.toThrow();
    expect(fixture.drawers.length).toBeGreaterThanOrEqual(15);
    expect(fixture.retrieval_cases.length).toBeGreaterThanOrEqual(20);
    expect(fixture.retrieval_cases.filter((item) => item.tags?.includes('identifier')).length).toBeGreaterThanOrEqual(5);
    expect(fixture.retrieval_cases.filter((item) => item.hard_scope === true).length).toBeGreaterThanOrEqual(5);
    expect(new Set(fixture.drawers.map((drawer) => drawer.tenant)).size).toBeGreaterThanOrEqual(2);
    expect(fixture.kg_cases.length).toBeGreaterThanOrEqual(5);
  });
});
