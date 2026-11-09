import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import candidate from '../../content/semantic-neighbors/ja.json';
import { practicePool } from './practice';

describe('selected Japanese semantic deployment candidate (#198)', () => {
  it('matches the actual approved app bank and exact intended card meanings', () => {
    const items = [...practicePool.items].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    expect(Object.keys(candidate.entries)).toEqual(items.map(item => item.id));
    const inputs = items.map(({ id, language, text, label }) => ({ id, language, text, label }));
    expect(candidate.sourceDigest).toBe(createHash('sha256').update(JSON.stringify(inputs)).digest('hex'));
    const entries = new Map(Object.entries(candidate.entries));
    for (const item of items) {
      expect(entries.get(item.id)).toMatchObject({ text: item.text, label: item.label });
    }
    expect(candidate.model.id).toBe('facebook/fasttext-ja-vectors');
  });

  it('keeps a finite full ranking for later pack filtering, without self or duplicate neighbors', () => {
    const ids = new Set(practicePool.items.map(item => item.id));
    for (const [id, entry] of Object.entries(candidate.entries)) {
      const neighbors = entry.neighbors as [string, number][];
      expect(neighbors).toHaveLength(ids.size - 1);
      expect(new Set(neighbors.map(([neighbor]) => neighbor)).size).toBe(ids.size - 1);
      expect(neighbors.some(([neighbor]) => neighbor === id || !ids.has(neighbor))).toBe(false);
      for (let i = 0; i < neighbors.length; i++) {
        expect(Number.isFinite(neighbors[i]![1])).toBe(true);
        expect(neighbors[i]![1]).toBeGreaterThanOrEqual(-1);
        expect(neighbors[i]![1]).toBeLessThanOrEqual(1);
        if (i > 0) expect(neighbors[i - 1]![1]).toBeGreaterThanOrEqual(neighbors[i]![1]);
      }
    }
  });
});
