/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { isEntityAbsorbed } from './tree-ops';
import { entityMerges, setEntityMerges } from './state';
import { addAlias, removeAlias } from './entity-merge';

beforeEach(() => {
  setEntityMerges({});
});

describe('merge validation via isEntityAbsorbed', () => {
  it('returns null when no merges exist', () => {
    expect(isEntityAbsorbed('any-id')).toBeNull();
  });

  it('detects absorbed entity', () => {
    setEntityMerges({
      'canonical-1': { absorbed: ['source-a', 'source-b'], aliases: [] },
    });
    expect(isEntityAbsorbed('source-a')).toBe('canonical-1');
    expect(isEntityAbsorbed('source-b')).toBe('canonical-1');
  });

  it('returns null for canonical entity itself', () => {
    setEntityMerges({
      'canonical-1': { absorbed: ['source-a'], aliases: [] },
    });
    expect(isEntityAbsorbed('canonical-1')).toBeNull();
  });

  it('returns null for unrelated entity', () => {
    setEntityMerges({
      'canonical-1': { absorbed: ['source-a'], aliases: [] },
    });
    expect(isEntityAbsorbed('unrelated')).toBeNull();
  });

  it('blocks transitive merge (absorbed entity cannot be canonical)', () => {
    setEntityMerges({
      'canonical-1': { absorbed: ['source-a'], aliases: [] },
    });
    // source-a is absorbed, so it shouldn't be used as a merge target
    expect(isEntityAbsorbed('source-a')).toBe('canonical-1');
  });
});

describe('alias management', () => {
  it('adds alias to entity', () => {
    setEntityMerges({ 'ent-1': { absorbed: [], aliases: [] } });
    addAlias('ent-1', 'Alt Name');
    expect(entityMerges['ent-1'].aliases).toContain('Alt Name');
  });

  it('prevents duplicate alias', () => {
    setEntityMerges({ 'ent-1': { absorbed: [], aliases: ['Existing'] } });
    addAlias('ent-1', 'Existing');
    // Should still have only one instance
    expect(entityMerges['ent-1'].aliases.filter((a: string) => a === 'Existing')).toHaveLength(1);
  });

  it('removes alias', () => {
    setEntityMerges({ 'ent-1': { absorbed: [], aliases: ['A', 'B', 'C'] } });
    removeAlias('ent-1', 'B');
    expect(entityMerges['ent-1'].aliases).toEqual(['A', 'C']);
  });

  it('creates alias array if missing', () => {
    setEntityMerges({});
    addAlias('new-ent', 'First Alias');
    expect(entityMerges['new-ent'].aliases).toContain('First Alias');
  });
});

describe('cross-company isolation', () => {
  it('merges are scoped to entityMerges state (set per-company on load)', () => {
    // Simulate loading abbvie merges
    setEntityMerges({ 'abbvie-ent': { absorbed: ['x'], aliases: [] } });
    expect(isEntityAbsorbed('x')).toBe('abbvie-ent');

    // Simulate switching to gsk (loadEntityMerges clears state first)
    setEntityMerges({});
    expect(isEntityAbsorbed('x')).toBeNull();
  });
});
