/**
 * Dedicated Worker entry point.
 * Each tab gets its own worker instance; OPFS provides persistence across reloads.
 */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
// Explicit ?url import so Vite knows to serve this file and we get its dev-server URL.
// Without this, the package resolves the WASM via import.meta.url internally, which
// breaks when Vite transforms the module for a worker context.
import wasmUrl from '@sqlite.org/sqlite-wasm/sqlite3.wasm?url';
import { initSchema } from './sql';
import { createContext, handleMessage } from './handler';
import type { HandlerContext } from './handler';
import type { WorkerRequest, WorkerResponse } from './types';

let ctx: HandlerContext | null = null;

console.log('[worker] script loaded, wasm url:', wasmUrl);

const initPromise = (async () => {
  try {
    console.log('[worker] calling sqlite3InitModule');
    const sqlite3 = await (sqlite3InitModule as (opts: Record<string, unknown>) => ReturnType<typeof sqlite3InitModule>)({
      print: console.log,
      printErr: console.error,
      locateFile: (path: string) => path.endsWith('.wasm') ? wasmUrl : path,
    });
    console.log('[worker] sqlite3InitModule resolved');

    let db: InstanceType<typeof sqlite3.oo1.DB>;

    if ('opfs' in sqlite3) {
      try {
        db = new (sqlite3.oo1 as any).OpfsDb('/firelocal.db');
        console.log('[worker] Using OPFS (persistent)');
      } catch (e) {
        console.warn('[worker] OPFS unavailable, falling back to in-memory:', e);
        db = new sqlite3.oo1.DB(':memory:');
      }
    } else {
      db = new sqlite3.oo1.DB(':memory:');
      console.log('[worker] Using in-memory SQLite');
    }

    initSchema(db as unknown as import('./sql').DbLike);
    ctx = createContext(db as unknown as import('./sql').DbLike);
    console.log('[worker] init complete, ctx ready');
  } catch (e) {
    console.error('[worker] init FAILED:', e);
  }
})();

self.addEventListener('message', async (e: MessageEvent<WorkerRequest>) => {
  console.log('[worker] message received:', e.data?.type, e.data);
  await initPromise;
  if (!ctx) {
    console.error('[worker] ctx is null — init failed');
    return;
  }
  handleMessage(ctx, e.data, (response: WorkerResponse) => {
    console.log('[worker] sending response:', response.type, response);
    self.postMessage(response);
  });
});
