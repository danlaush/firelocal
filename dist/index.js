import { FirelocalClient } from './client';
export function initFirelocal(workerOrUrl = new URL('./worker.ts', import.meta.url)) {
    return { client: new FirelocalClient(workerOrUrl) };
}
export function getDb(app) {
    return { app };
}
export function doc(db, ...segments) {
    return { _kind: 'doc', db, path: segments.join('/') };
}
export function collection(db, ...segments) {
    return { _kind: 'col', db, path: segments.join('/') };
}
// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
export async function getDoc(ref) {
    const data = (await client(ref).request({ type: 'GET_DOC', path: ref.path }));
    return makeDocSnapshot(ref, data);
}
export async function getDocs(q) {
    const { ref, constraints } = q._kind === 'query' ? q : { ref: q, constraints: [] };
    const docs = (await client(ref).request({
        type: 'GET_COLLECTION',
        collectionPath: ref.path,
        constraints,
    }));
    return makeQuerySnapshot(ref.db, docs);
}
// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------
export async function setDoc(ref, data, options) {
    await client(ref).request({ type: 'SET_DOC', path: ref.path, data, merge: options?.merge });
}
export async function addDoc(ref, data) {
    const result = (await client(ref).request({
        type: 'ADD_DOC',
        collectionPath: ref.path,
        data,
    }));
    return { _kind: 'doc', db: ref.db, path: result.path };
}
export async function updateDoc(ref, data) {
    await client(ref).request({ type: 'UPDATE_DOC', path: ref.path, data });
}
export async function deleteDoc(ref) {
    await client(ref).request({ type: 'DELETE_DOC', path: ref.path });
}
export function onSnapshot(ref, 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
callback) {
    if (ref._kind === 'doc') {
        return client(ref).subscribe('SUBSCRIBE_DOC', { path: ref.path }, (raw) => {
            const snap = raw;
            callback(makeDocSnapshot(ref, snap.data));
        });
    }
    const { colRef, constraints } = ref._kind === 'query'
        ? { colRef: ref.ref, constraints: ref.constraints }
        : { colRef: ref, constraints: [] };
    return client(colRef).subscribe('SUBSCRIBE_QUERY', { collectionPath: colRef.path, constraints }, (raw) => {
        const snap = raw;
        callback(makeQuerySnapshot(colRef.db, snap.docs));
    });
}
// ---------------------------------------------------------------------------
// Query builders
// ---------------------------------------------------------------------------
export function query(ref, ...constraints) {
    return { _kind: 'query', ref, constraints };
}
export function where(field, op, value) {
    return { type: 'where', field, op, value };
}
export function orderBy(field, dir = 'asc') {
    return { type: 'orderBy', field, dir };
}
export function limit(n) {
    return { type: 'limit', n };
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function client(ref) {
    return ref.db.app.client;
}
function makeDocSnapshot(ref, data) {
    return {
        id: ref.path.split('/').pop(),
        ref,
        exists: () => data !== null,
        data: () => data ?? undefined,
        get: (field) => data?.[field],
    };
}
function makeQuerySnapshot(db, docs) {
    const snapDocs = docs.map(({ path, data }) => ({
        id: path.split('/').pop(),
        ref: { _kind: 'doc', db, path },
        exists: () => true,
        data: () => data,
        get: (field) => data[field],
    }));
    return {
        docs: snapDocs,
        empty: snapDocs.length === 0,
        size: snapDocs.length,
        forEach: (fn) => snapDocs.forEach(fn),
    };
}
//# sourceMappingURL=index.js.map