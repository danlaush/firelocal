import { describe, it, expect } from 'vitest';
import { applyConstraints } from '../../src/query';
import type { DocEntry } from '../../src/query';

const docs: DocEntry[] = [
  { path: 'designs/a', data: { title: 'Alpha', status: 'draft', score: 3, tags: ['ui', 'web'] } },
  { path: 'designs/b', data: { title: 'Beta',  status: 'crawled', score: 1, tags: ['api'] } },
  { path: 'designs/c', data: { title: 'Gamma', status: 'draft', score: 2, tags: ['ui'] } },
  { path: 'designs/d', data: { title: 'Delta', status: 'published', score: 4, tags: [] } },
];

describe('applyConstraints', () => {
  describe('where', () => {
    it('== filters by equality', () => {
      const result = applyConstraints(docs, [{ type: 'where', field: 'status', op: '==', value: 'draft' }]);
      expect(result.map((d) => d.path)).toEqual(['designs/a', 'designs/c']);
    });

    it('!= filters by inequality', () => {
      const result = applyConstraints(docs, [{ type: 'where', field: 'status', op: '!=', value: 'draft' }]);
      expect(result.map((d) => d.path)).toEqual(['designs/b', 'designs/d']);
    });

    it('> filters numerically', () => {
      const result = applyConstraints(docs, [{ type: 'where', field: 'score', op: '>', value: 2 }]);
      expect(result.map((d) => d.path)).toEqual(['designs/a', 'designs/d']);
    });

    it('>= filters numerically', () => {
      const result = applyConstraints(docs, [{ type: 'where', field: 'score', op: '>=', value: 2 }]);
      expect(result.map((d) => d.path)).toEqual(['designs/a', 'designs/c', 'designs/d']);
    });

    it('< filters numerically', () => {
      const result = applyConstraints(docs, [{ type: 'where', field: 'score', op: '<', value: 2 }]);
      expect(result.map((d) => d.path)).toEqual(['designs/b']);
    });

    it('<= filters numerically', () => {
      const result = applyConstraints(docs, [{ type: 'where', field: 'score', op: '<=', value: 2 }]);
      expect(result.map((d) => d.path)).toEqual(['designs/b', 'designs/c']);
    });

    it('array-contains checks array membership', () => {
      const result = applyConstraints(docs, [{ type: 'where', field: 'tags', op: 'array-contains', value: 'ui' }]);
      expect(result.map((d) => d.path)).toEqual(['designs/a', 'designs/c']);
    });

    it('in checks value is in list', () => {
      const result = applyConstraints(docs, [{ type: 'where', field: 'status', op: 'in', value: ['draft', 'published'] }]);
      expect(result.map((d) => d.path)).toEqual(['designs/a', 'designs/c', 'designs/d']);
    });

    it('not-in excludes values in list', () => {
      const result = applyConstraints(docs, [{ type: 'where', field: 'status', op: 'not-in', value: ['draft', 'published'] }]);
      expect(result.map((d) => d.path)).toEqual(['designs/b']);
    });

    it('chains multiple where constraints (AND)', () => {
      const result = applyConstraints(docs, [
        { type: 'where', field: 'status', op: '==', value: 'draft' },
        { type: 'where', field: 'score', op: '>', value: 2 },
      ]);
      expect(result.map((d) => d.path)).toEqual(['designs/a']);
    });
  });

  describe('orderBy', () => {
    it('sorts ascending by string field', () => {
      const result = applyConstraints(docs, [{ type: 'orderBy', field: 'title', dir: 'asc' }]);
      expect(result.map((d) => d.data['title'])).toEqual(['Alpha', 'Beta', 'Delta', 'Gamma']);
    });

    it('sorts descending by string field', () => {
      const result = applyConstraints(docs, [{ type: 'orderBy', field: 'title', dir: 'desc' }]);
      expect(result.map((d) => d.data['title'])).toEqual(['Gamma', 'Delta', 'Beta', 'Alpha']);
    });

    it('sorts ascending by numeric field', () => {
      const result = applyConstraints(docs, [{ type: 'orderBy', field: 'score', dir: 'asc' }]);
      expect(result.map((d) => d.data['score'])).toEqual([1, 2, 3, 4]);
    });
  });

  describe('limit', () => {
    it('limits results', () => {
      const result = applyConstraints(docs, [{ type: 'limit', n: 2 }]);
      expect(result).toHaveLength(2);
    });

    it('limit applied after where and orderBy', () => {
      const result = applyConstraints(docs, [
        { type: 'where', field: 'status', op: '!=', value: 'published' },
        { type: 'orderBy', field: 'score', dir: 'asc' },
        { type: 'limit', n: 2 },
      ]);
      expect(result.map((d) => d.data['score'])).toEqual([1, 2]);
    });
  });

  describe('nested field access', () => {
    const nested: DocEntry[] = [
      { path: 'a/1', data: { meta: { priority: 2 } } },
      { path: 'a/2', data: { meta: { priority: 5 } } },
    ];

    it('accesses dot-notation fields', () => {
      const result = applyConstraints(nested, [
        { type: 'where', field: 'meta.priority', op: '>', value: 3 },
      ]);
      expect(result.map((d) => d.path)).toEqual(['a/2']);
    });
  });

  describe('edge cases', () => {
    it('returns all docs when no constraints', () => {
      expect(applyConstraints(docs, [])).toHaveLength(4);
    });

    it('returns empty array when nothing matches', () => {
      const result = applyConstraints(docs, [{ type: 'where', field: 'status', op: '==', value: 'unknown' }]);
      expect(result).toHaveLength(0);
    });

    it('does not mutate the input array', () => {
      const input = [...docs];
      applyConstraints(docs, [{ type: 'orderBy', field: 'score', dir: 'desc' }]);
      expect(docs).toEqual(input);
    });
  });
});
