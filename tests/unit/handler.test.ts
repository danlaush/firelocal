/**
 * Tests for the worker message handler using a mock in-memory DB.
 * No SharedWorker, no WASM — just the pure handler logic.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createContext, handleMessage } from '../../src/handler';
import { initSchema } from '../../src/sql';
import type { HandlerContext } from '../../src/handler';
import type { WorkerResponse } from '../../src/types';

// ---------------------------------------------------------------------------
// Minimal in-memory DB mock using a plain Map
// ---------------------------------------------------------------------------

function createMockDb() {
  const store = new Map<string, string>();

  return {
    store,
    exec({ sql, bind = [] }: { sql: string; bind?: unknown[] }) {
      const s = sql.trim().replace(/\s+/g, ' ');
      if (s.startsWith('CREATE TABLE')) return;
      if (s.startsWith('INSERT OR REPLACE INTO documents')) {
        const [path, data] = bind as [string, string];
        store.set(path!, data!);
        return;
      }
      if (s.startsWith('DELETE FROM documents WHERE path = ?')) {
        store.delete(bind[0] as string);
        return;
      }
      throw new Error(`Unhandled exec: ${sql}`);
    },
    selectObjects<T>(sql: string, bind: unknown[] = []): T[] {
      const s = sql.trim().replace(/\s+/g, ' ');
      if (s.startsWith('SELECT data FROM documents WHERE path = ?')) {
        const path = bind[0] as string;
        const data = store.get(path);
        return data ? [{ data } as T] : [];
      }
      if (s.startsWith('SELECT path, data FROM documents WHERE path LIKE ? AND path NOT LIKE ?')) {
        // bind[0] = 'col/%' — direct children prefix
        const prefix = (bind[0] as string).slice(0, -1); // 'col/'
        const results: Array<{ path: string; data: string }> = [];
        for (const [path, data] of store.entries()) {
          const remainder = path.startsWith(prefix) ? path.slice(prefix.length) : null;
          if (remainder !== null && !remainder.includes('/')) {
            results.push({ path, data });
          }
        }
        return results as T[];
      }
      throw new Error(`Unhandled selectObjects: ${sql}`);
    },
  };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function setup() {
  const db = createMockDb();
  initSchema(db);
  const ctx = createContext(db);
  const responses: WorkerResponse[] = [];
  const respond = (r: WorkerResponse) => responses.push(r);
  return { ctx, db, responses, respond };
}

function send(ctx: HandlerContext, respond: (r: WorkerResponse) => void, msg: object) {
  handleMessage(ctx, msg as any, respond);
}

function lastResult(responses: WorkerResponse[]) {
  const last = responses[responses.length - 1];
  if (!last || last.type !== 'RESULT') throw new Error('Expected RESULT');
  return last.data;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handler: CRUD', () => {
  it('SET_DOC + GET_DOC round-trips data', () => {
    const { ctx, responses, respond } = setup();

    send(ctx, respond, { type: 'SET_DOC', id: '1', path: 'col/doc', data: { x: 42 } });
    send(ctx, respond, { type: 'GET_DOC', id: '2', path: 'col/doc' });

    expect(lastResult(responses)).toEqual({ x: 42 });
  });

  it('GET_DOC returns null for missing doc', () => {
    const { ctx, responses, respond } = setup();
    send(ctx, respond, { type: 'GET_DOC', id: '1', path: 'col/missing' });
    expect(lastResult(responses)).toBeNull();
  });

  it('SET_DOC with merge = true merges fields', () => {
    const { ctx, responses, respond } = setup();
    send(ctx, respond, { type: 'SET_DOC', id: '1', path: 'col/doc', data: { a: 1, b: 2 } });
    send(ctx, respond, { type: 'SET_DOC', id: '2', path: 'col/doc', data: { b: 99, c: 3 }, merge: true });
    send(ctx, respond, { type: 'GET_DOC', id: '3', path: 'col/doc' });
    expect(lastResult(responses)).toEqual({ a: 1, b: 99, c: 3 });
  });

  it('UPDATE_DOC merges fields into existing doc', () => {
    const { ctx, responses, respond } = setup();
    send(ctx, respond, { type: 'SET_DOC', id: '1', path: 'col/doc', data: { a: 1, b: 2 } });
    send(ctx, respond, { type: 'UPDATE_DOC', id: '2', path: 'col/doc', data: { b: 42 } });
    send(ctx, respond, { type: 'GET_DOC', id: '3', path: 'col/doc' });
    expect(lastResult(responses)).toEqual({ a: 1, b: 42 });
  });

  it('UPDATE_DOC on missing doc returns ERROR', () => {
    const { ctx, responses, respond } = setup();
    send(ctx, respond, { type: 'UPDATE_DOC', id: '1', path: 'col/missing', data: { x: 1 } });
    const last = responses[responses.length - 1]!;
    expect(last.type).toBe('ERROR');
  });

  it('DELETE_DOC removes the document', () => {
    const { ctx, responses, respond } = setup();
    send(ctx, respond, { type: 'SET_DOC', id: '1', path: 'col/doc', data: { x: 1 } });
    send(ctx, respond, { type: 'DELETE_DOC', id: '2', path: 'col/doc' });
    send(ctx, respond, { type: 'GET_DOC', id: '3', path: 'col/doc' });
    expect(lastResult(responses)).toBeNull();
  });

  it('ADD_DOC generates a path and stores data', () => {
    const { ctx, responses, respond } = setup();
    send(ctx, respond, { type: 'ADD_DOC', id: '1', collectionPath: 'col', data: { name: 'new' } });
    const result = lastResult(responses) as { path: string };
    expect(result.path).toMatch(/^col\/.+/);

    send(ctx, respond, { type: 'GET_DOC', id: '2', path: result.path });
    expect(lastResult(responses)).toEqual({ name: 'new' });
  });

  it('GET_COLLECTION returns direct children only', () => {
    const { ctx, responses, respond } = setup();
    send(ctx, respond, { type: 'SET_DOC', id: '1', path: 'col/a', data: { n: 1 } });
    send(ctx, respond, { type: 'SET_DOC', id: '2', path: 'col/b', data: { n: 2 } });
    send(ctx, respond, { type: 'SET_DOC', id: '3', path: 'col/a/sub', data: { n: 3 } }); // sub-collection, excluded
    send(ctx, respond, { type: 'GET_COLLECTION', id: '4', collectionPath: 'col', constraints: [] });
    const docs = lastResult(responses) as Array<{ path: string }>;
    expect(docs.map((d) => d.path).sort()).toEqual(['col/a', 'col/b']);
  });
});

describe('handler: subscriptions', () => {
  it('SUBSCRIBE_DOC fires initial snapshot immediately', () => {
    const { ctx, respond } = setup();
    send(ctx, respond, { type: 'SET_DOC', id: '1', path: 'col/doc', data: { v: 1 } });

    const snapshots: WorkerResponse[] = [];
    send(ctx, (r) => snapshots.push(r), { type: 'SUBSCRIBE_DOC', subId: 'sub-1', path: 'col/doc' });

    expect(snapshots).toHaveLength(1);
    const snap = snapshots[0] as Extract<WorkerResponse, { type: 'SNAPSHOT' }>;
    expect(snap.type).toBe('SNAPSHOT');
    expect(snap.subId).toBe('sub-1');
    expect(snap.snapshot).toMatchObject({ kind: 'doc', path: 'col/doc', data: { v: 1 } });
  });

  it('SUBSCRIBE_DOC fires initial snapshot with null when doc missing', () => {
    const { ctx } = setup();
    const snapshots: WorkerResponse[] = [];
    send(ctx, (r) => snapshots.push(r), { type: 'SUBSCRIBE_DOC', subId: 'sub-1', path: 'col/missing' });

    const snap = snapshots[0] as Extract<WorkerResponse, { type: 'SNAPSHOT' }>;
    expect(snap.snapshot).toMatchObject({ kind: 'doc', data: null });
  });

  it('SUBSCRIBE_DOC receives push when doc is written', () => {
    const { ctx, respond } = setup();
    const snapshots: WorkerResponse[] = [];
    send(ctx, (r) => snapshots.push(r), { type: 'SUBSCRIBE_DOC', subId: 'sub-1', path: 'col/doc' });

    // Write triggers a second snapshot
    send(ctx, respond, { type: 'SET_DOC', id: '1', path: 'col/doc', data: { v: 2 } });

    expect(snapshots).toHaveLength(2);
    const pushed = snapshots[1] as Extract<WorkerResponse, { type: 'SNAPSHOT' }>;
    expect(pushed.snapshot).toMatchObject({ kind: 'doc', data: { v: 2 } });
  });

  it('SUBSCRIBE_DOC does not fire for unrelated writes', () => {
    const { ctx, respond } = setup();
    const snapshots: WorkerResponse[] = [];
    send(ctx, (r) => snapshots.push(r), { type: 'SUBSCRIBE_DOC', subId: 'sub-1', path: 'col/doc' });

    send(ctx, respond, { type: 'SET_DOC', id: '1', path: 'col/other', data: { v: 1 } });

    expect(snapshots).toHaveLength(1); // only the initial
  });

  it('SUBSCRIBE_QUERY fires initial snapshot', () => {
    const { ctx, respond } = setup();
    send(ctx, respond, { type: 'SET_DOC', id: '1', path: 'col/a', data: { n: 1 } });

    const snapshots: WorkerResponse[] = [];
    send(ctx, (r) => snapshots.push(r), {
      type: 'SUBSCRIBE_QUERY', subId: 'sub-q', collectionPath: 'col', constraints: [],
    });

    const snap = snapshots[0] as Extract<WorkerResponse, { type: 'SNAPSHOT' }>;
    expect(snap.snapshot).toMatchObject({ kind: 'query' });
    const qs = snap.snapshot as any;
    expect(qs.docs).toHaveLength(1);
  });

  it('SUBSCRIBE_QUERY receives push when doc in collection changes', () => {
    const { ctx, respond } = setup();
    const snapshots: WorkerResponse[] = [];
    send(ctx, (r) => snapshots.push(r), {
      type: 'SUBSCRIBE_QUERY', subId: 'sub-q', collectionPath: 'col', constraints: [],
    });

    send(ctx, respond, { type: 'SET_DOC', id: '1', path: 'col/new', data: { n: 99 } });

    expect(snapshots).toHaveLength(2);
    const pushed = snapshots[1] as Extract<WorkerResponse, { type: 'SNAPSHOT' }>;
    const qs = pushed.snapshot as any;
    expect(qs.docs.some((d: any) => d.data.n === 99)).toBe(true);
  });

  it('SUBSCRIBE_QUERY does not fire for sub-collection writes', () => {
    const { ctx, respond } = setup();
    const snapshots: WorkerResponse[] = [];
    send(ctx, (r) => snapshots.push(r), {
      type: 'SUBSCRIBE_QUERY', subId: 'sub-q', collectionPath: 'col', constraints: [],
    });

    send(ctx, respond, { type: 'SET_DOC', id: '1', path: 'col/doc/sub', data: {} });

    expect(snapshots).toHaveLength(1); // only initial
  });

  it('UNSUBSCRIBE stops further notifications', () => {
    const { ctx, respond } = setup();
    const snapshots: WorkerResponse[] = [];
    send(ctx, (r) => snapshots.push(r), { type: 'SUBSCRIBE_DOC', subId: 'sub-1', path: 'col/doc' });

    send(ctx, respond, { type: 'UNSUBSCRIBE', subId: 'sub-1' });
    send(ctx, respond, { type: 'SET_DOC', id: '1', path: 'col/doc', data: { v: 1 } });

    expect(snapshots).toHaveLength(1); // only the initial, no push after unsubscribe
  });
});
