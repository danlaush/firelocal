# Implementation Plan

## Questions to resolve before starting

1. **Drop-in compatibility vs. inspired-by?** Should imports be swappable (`import ... from 'firebase/firestore'` → `import ... from 'firelocal'`) or is a slightly different API fine? Drop-in requires matching every edge case of DocumentSnapshot, QuerySnapshot, etc. Firebase-inspired is much simpler to build.

2. **Persistence strategy**: SQLite WASM has two storage backends — Origin Private File System (OPFS, persistent across sessions) or in-memory (wiped on page close). OPFS is the right default for this use case but requires a secure context and has some browser support caveats. Worth confirming.

3. **Which SQLite WASM library?** Two main options:
   - `@sqlite.org/sqlite-wasm` (official, uses OPFS well, larger bundle)
   - `wa-sqlite` (lighter, more control, OPFS support via custom VFS)

4. **Test environment**: Vitest (JSDOM) can't run SharedWorkers or SQLite WASM directly. Tests will need either a real browser runner (Playwright + Vitest browser mode) or a mock-worker abstraction. Recommend the latter for unit tests + Playwright for integration.

---

## Phase 1 — Project setup

**Goal**: Runnable TypeScript project with tooling in place.

Files:
- `package.json` — deps: `@sqlite.org/sqlite-wasm` (or `wa-sqlite`), `vite`, `vitest`, `typescript`
- `tsconfig.json`
- `vite.config.ts` — worker build config, OPFS headers (COOP/COEP required for SharedArrayBuffer)
- `src/types.ts` — message protocol types (request/response/snapshot union types)

The message protocol is the backbone; define it clearly upfront:

```ts
// Worker-bound requests
type WorkerRequest =
  | { type: 'GET_DOC';          id: string; path: string }
  | { type: 'SET_DOC';          id: string; path: string; data: object; merge?: boolean }
  | { type: 'ADD_DOC';          id: string; collectionPath: string; data: object }
  | { type: 'UPDATE_DOC';       id: string; path: string; data: object }
  | { type: 'DELETE_DOC';       id: string; path: string }
  | { type: 'QUERY';            id: string; collectionPath: string; constraints: Constraint[] }
  | { type: 'SUBSCRIBE_DOC';    subId: string; path: string }
  | { type: 'SUBSCRIBE_QUERY';  subId: string; collectionPath: string; constraints: Constraint[] }
  | { type: 'UNSUBSCRIBE';      subId: string };

// Main-thread-bound responses
type WorkerResponse =
  | { type: 'RESULT';   id: string; data: unknown }
  | { type: 'ERROR';    id: string; error: string }
  | { type: 'SNAPSHOT'; subId: string; data: SnapshotData };
```

---

## Phase 2 — SharedWorker + SQLite core

**Goal**: Worker initialises SQLite, handles CRUD requests, responds with results.

Files:
- `src/worker.ts` — SharedWorker entry; handles `connect` events, routes messages to handlers
- `src/sql.ts` — schema definition, typed query helpers

**Schema**:
```sql
CREATE TABLE IF NOT EXISTS documents (
  path       TEXT    PRIMARY KEY,   -- e.g. "designs/abc123"
  data       TEXT    NOT NULL,      -- JSON blob
  updated_at INTEGER NOT NULL
);
```

Collections are implicit: all docs with `path LIKE 'designs/%' AND path NOT LIKE 'designs/%/%'` are in the `designs` collection.

**Worker init sequence**:
1. Import and initialise `@sqlite.org/sqlite-wasm` with OPFS VFS
2. Run schema migration (CREATE TABLE IF NOT EXISTS)
3. Start accepting messages on connected ports

**CRUD handlers** (synchronous SQLite calls, async postMessage responses):
- `GET_DOC` → `SELECT data FROM documents WHERE path = ?`
- `SET_DOC` → `INSERT OR REPLACE INTO documents ...`
- `UPDATE_DOC` → read existing JSON, shallow-merge, write back
- `ADD_DOC` → generate UUID, insert at `collectionPath/uuid`
- `DELETE_DOC` → `DELETE FROM documents WHERE path = ?`

---

## Phase 3 — Main-thread client and public API

**Goal**: The Firebase-compatible functions work end-to-end for read/write.

Files:
- `src/client.ts` — `FirelocalClient` class; manages SharedWorker connection, in-flight request map (id → Promise resolver), message dispatch
- `src/index.ts` — public functions (`doc`, `collection`, `getDoc`, `setDoc`, etc.) as thin wrappers over the client

**Client request pattern**:
```ts
function request(msg: WorkerRequest): Promise<unknown> {
  const id = nanoid();
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    port.postMessage({ ...msg, id });
  });
}
// Worker responses call pending.get(id).resolve(data) or .reject(error)
```

**DocumentReference / CollectionReference** are plain objects (no class inheritance needed):
```ts
type DocumentReference = { db: FirelocalDb; path: string };
type CollectionReference = { db: FirelocalDb; path: string };
```

**DocumentSnapshot** wraps the raw data:
```ts
type DocumentSnapshot = {
  id: string;
  exists: () => boolean;
  data: () => object | undefined;
  get: (field: string) => unknown;
};
```

---

## Phase 4 — Reactive subscriptions (onSnapshot)

**Goal**: `onSnapshot` pushes updates to callbacks when relevant data changes.

Changes to worker (`src/worker.ts`):
- Add `SubscriptionRegistry`: `Map<subId, { type, path/query, port }>`
- After every successful write, call `notifySubscribers(affectedPath)`
- `notifySubscribers` scans registry, sends `SNAPSHOT` message to matching ports

Changes to client (`src/client.ts`):
- `onSnapshot(ref, callback)` → generates subId, sends `SUBSCRIBE_*` to worker, stores `subId → callback` locally
- Incoming `SNAPSHOT` messages → look up subId → call callback with constructed snapshot
- Returns unsubscribe function that sends `UNSUBSCRIBE` and removes local entry

**Notification logic in worker**:

For a document write at path `P`:
- Notify all `SUBSCRIBE_DOC` subs where `sub.path === P`
- Notify all `SUBSCRIBE_QUERY` subs where `P` starts with `sub.collectionPath/` and doc passes query filters

Initial snapshot: on `SUBSCRIBE_*`, immediately read current state and send a `SNAPSHOT` before any future changes (matches Firestore behaviour).

---

## Phase 5 — Query constraints

**Goal**: `query(collection, where(...), orderBy(...), limit(...))` works in subscriptions and `getDocs`.

Files:
- `src/query.ts` — constraint builders and SQL translation

**Constraint types**: `where(field, op, value)`, `orderBy(field, dir)`, `limit(n)`

**SQL translation**: constraints are serialised into the `WorkerRequest` and re-evaluated in the worker.

`where` operators to support: `==`, `!=`, `<`, `<=`, `>`, `>=`, `array-contains`, `in`, `not-in`

Implementation approach: fetch matching docs by collection prefix, then filter/sort in JS using the constraint definitions (avoids complex JSON-field SQL). Only switch to SQL-level filtering if performance demands it.

---

## Phase 6 — Example app

**Goal**: Visual demo that mirrors the design doc visualiser use case.

Files:
- `example/index.html`
- `example/app.ts`

The demo should show:
1. A text input to add a "document" with a title and a list of references to other doc IDs
2. A simple node graph (can be plain SVG or use a tiny lib like `d3-force`) that renders docs as nodes and references as edges
3. A "crawl" button that simulates async crawling: picks a random unvisited reference, writes it to the DB after a short delay
4. The graph updates reactively as new docs are written — no manual refresh

This directly validates the core use case.

---

## Phase 7 — Tests

**Goal**: Confidence in correctness and regression safety.

**Unit tests** (`tests/unit/`, Vitest + JSDOM):
- Mock the SharedWorker with a direct in-process SQLite instance
- Test each public API function: getDoc, setDoc, updateDoc, deleteDoc, addDoc, getDocs
- Test query constraints (where, orderBy, limit)
- Test onSnapshot callback invocation order and content
- Test unsubscribe stops further callbacks

**Integration tests** (`tests/integration/`, Vitest browser mode or Playwright):
- Real SharedWorker + SQLite WASM in a headless browser
- Concurrent writes from two "tabs" (two page contexts)
- Subscription fan-out: multiple subscribers on the same doc
- OPFS persistence: write, reload page, verify data survives

---

## Dependency decisions (to confirm)

| Concern | Recommendation | Alternative |
|---|---|---|
| SQLite WASM | `@sqlite.org/sqlite-wasm` | `wa-sqlite` |
| Bundler | Vite (handles WASM, worker builds) | esbuild |
| Tests | Vitest | Jest |
| ID generation | `crypto.randomUUID()` (built-in) | nanoid |
| Example graph | D3 force layout | Vanilla SVG |
