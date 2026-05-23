import { FirelocalClient } from './client';
import type { Constraint, WhereOp, DocData, RawDocSnapshot, RawQuerySnapshot, RawSnapshot } from './types';

// ---------------------------------------------------------------------------
// App / DB handles
// ---------------------------------------------------------------------------

export type FirelocalApp = { client: FirelocalClient };
export type FirelocalDb = { app: FirelocalApp };

export function initFirelocal(
  workerOrUrl: string | URL | Worker = new URL('./worker.ts', import.meta.url),
): FirelocalApp {
  return { client: new FirelocalClient(workerOrUrl) };
}

export function getDb(app: FirelocalApp): FirelocalDb {
  return { app };
}

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

export type DocumentReference = { _kind: 'doc'; db: FirelocalDb; path: string };
export type CollectionReference = { _kind: 'col'; db: FirelocalDb; path: string };
export type FirelocalQuery = { _kind: 'query'; ref: CollectionReference; constraints: Constraint[] };

export function doc(db: FirelocalDb, ...segments: string[]): DocumentReference {
  return { _kind: 'doc', db, path: segments.join('/') };
}

export function collection(db: FirelocalDb, ...segments: string[]): CollectionReference {
  return { _kind: 'col', db, path: segments.join('/') };
}

// ---------------------------------------------------------------------------
// Snapshot types
// ---------------------------------------------------------------------------

export type DocumentSnapshot = {
  id: string;
  ref: DocumentReference;
  exists(): boolean;
  data(): DocData | undefined;
  get(field: string): unknown;
};

export type QueryDocumentSnapshot = {
  id: string;
  ref: DocumentReference;
  exists(): true;
  data(): DocData;
  get(field: string): unknown;
};

export type QuerySnapshot = {
  docs: QueryDocumentSnapshot[];
  empty: boolean;
  size: number;
  forEach(fn: (doc: QueryDocumentSnapshot) => void): void;
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getDoc(ref: DocumentReference): Promise<DocumentSnapshot> {
  const data = (await client(ref).request({ type: 'GET_DOC', path: ref.path })) as DocData | null;
  return makeDocSnapshot(ref, data);
}

export async function getDocs(q: FirelocalQuery | CollectionReference): Promise<QuerySnapshot> {
  const { ref, constraints } =
    q._kind === 'query' ? q : { ref: q, constraints: [] as Constraint[] };
  const docs = (await client(ref).request({
    type: 'GET_COLLECTION',
    collectionPath: ref.path,
    constraints,
  })) as Array<{ path: string; data: DocData }>;
  return makeQuerySnapshot(ref.db, docs);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function setDoc(
  ref: DocumentReference,
  data: DocData,
  options?: { merge?: boolean },
): Promise<void> {
  await client(ref).request({ type: 'SET_DOC', path: ref.path, data, merge: options?.merge });
}

export async function addDoc(
  ref: CollectionReference,
  data: DocData,
): Promise<DocumentReference> {
  const result = (await client(ref).request({
    type: 'ADD_DOC',
    collectionPath: ref.path,
    data,
  })) as { path: string };
  return { _kind: 'doc', db: ref.db, path: result.path };
}

export async function updateDoc(ref: DocumentReference, data: DocData): Promise<void> {
  await client(ref).request({ type: 'UPDATE_DOC', path: ref.path, data });
}

export async function deleteDoc(ref: DocumentReference): Promise<void> {
  await client(ref).request({ type: 'DELETE_DOC', path: ref.path });
}

// ---------------------------------------------------------------------------
// Real-time subscriptions
// ---------------------------------------------------------------------------

export function onSnapshot(
  ref: DocumentReference,
  callback: (snap: DocumentSnapshot) => void,
): () => void;
export function onSnapshot(
  ref: CollectionReference | FirelocalQuery,
  callback: (snap: QuerySnapshot) => void,
): () => void;
export function onSnapshot(
  ref: DocumentReference | CollectionReference | FirelocalQuery,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback: (snap: any) => void,
): () => void {
  if (ref._kind === 'doc') {
    return client(ref).subscribe('SUBSCRIBE_DOC', { path: ref.path }, (raw: RawSnapshot) => {
      const snap = raw as RawDocSnapshot;
      callback(makeDocSnapshot(ref, snap.data));
    });
  }

  const { colRef, constraints } =
    ref._kind === 'query'
      ? { colRef: ref.ref, constraints: ref.constraints }
      : { colRef: ref, constraints: [] as Constraint[] };

  return client(colRef).subscribe(
    'SUBSCRIBE_QUERY',
    { collectionPath: colRef.path, constraints },
    (raw: RawSnapshot) => {
      const snap = raw as RawQuerySnapshot;
      callback(makeQuerySnapshot(colRef.db, snap.docs));
    },
  );
}

// ---------------------------------------------------------------------------
// Query builders
// ---------------------------------------------------------------------------

export function query(ref: CollectionReference, ...constraints: Constraint[]): FirelocalQuery {
  return { _kind: 'query', ref, constraints };
}

export function where(field: string, op: WhereOp, value: unknown): Constraint {
  return { type: 'where', field, op, value };
}

export function orderBy(field: string, dir: 'asc' | 'desc' = 'asc'): Constraint {
  return { type: 'orderBy', field, dir };
}

export function limit(n: number): Constraint {
  return { type: 'limit', n };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function client(ref: DocumentReference | CollectionReference): FirelocalClient {
  return ref.db.app.client;
}

function makeDocSnapshot(ref: DocumentReference, data: DocData | null): DocumentSnapshot {
  return {
    id: ref.path.split('/').pop()!,
    ref,
    exists: () => data !== null,
    data: () => data ?? undefined,
    get: (field: string) => data?.[field],
  };
}

function makeQuerySnapshot(
  db: FirelocalDb,
  docs: Array<{ path: string; data: DocData }>,
): QuerySnapshot {
  const snapDocs: QueryDocumentSnapshot[] = docs.map(({ path, data }) => ({
    id: path.split('/').pop()!,
    ref: { _kind: 'doc', db, path },
    exists: () => true as const,
    data: () => data,
    get: (field: string) => data[field],
  }));
  return {
    docs: snapDocs,
    empty: snapDocs.length === 0,
    size: snapDocs.length,
    forEach: (fn) => snapDocs.forEach(fn),
  };
}
