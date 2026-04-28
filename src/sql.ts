import type { DocData } from './types';
import type { DocEntry } from './query';

/** Minimal interface matching the @sqlite.org/sqlite-wasm OO1 DB API we use. */
export interface DbLike {
  exec(opts: { sql: string; bind?: unknown[] }): void;
  selectObjects<T = Record<string, unknown>>(sql: string, bind?: unknown[]): T[];
}

export function initSchema(db: DbLike): void {
  db.exec({
    sql: `
      CREATE TABLE IF NOT EXISTS documents (
        path       TEXT    PRIMARY KEY,
        data       TEXT    NOT NULL DEFAULT '{}',
        updated_at INTEGER NOT NULL
      )
    `,
  });
}

export function getDoc(db: DbLike, path: string): DocData | null {
  const rows = db.selectObjects<{ data: string }>('SELECT data FROM documents WHERE path = ?', [path]);
  if (rows.length === 0) return null;
  return JSON.parse(rows[0]!.data);
}

export function setDoc(db: DbLike, path: string, data: DocData, merge = false): void {
  const toWrite = merge ? { ...(getDoc(db, path) ?? {}), ...data } : data;
  db.exec({
    sql: 'INSERT OR REPLACE INTO documents (path, data, updated_at) VALUES (?, ?, ?)',
    bind: [path, JSON.stringify(toWrite), Date.now()],
  });
}

export function updateDoc(db: DbLike, path: string, data: DocData): void {
  const existing = getDoc(db, path);
  if (existing === null) throw new Error(`No document at path: ${path}`);
  setDoc(db, path, { ...existing, ...data });
}

export function deleteDoc(db: DbLike, path: string): void {
  db.exec({ sql: 'DELETE FROM documents WHERE path = ?', bind: [path] });
}

export function addDoc(db: DbLike, collectionPath: string, data: DocData): string {
  const id = crypto.randomUUID();
  const path = `${collectionPath}/${id}`;
  setDoc(db, path, data);
  return path;
}

/** Returns direct children of a collection (no sub-collections). */
export function getCollection(db: DbLike, collectionPath: string): DocEntry[] {
  const rows = db.selectObjects<{ path: string; data: string }>(
    `SELECT path, data FROM documents WHERE path LIKE ? AND path NOT LIKE ?`,
    [`${collectionPath}/%`, `${collectionPath}/%/%`],
  );
  return rows.map((r) => ({ path: r.path, data: JSON.parse(r.data) }));
}
