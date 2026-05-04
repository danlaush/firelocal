import type { DocData } from './types';
import type { DocEntry } from './query';
/** Minimal interface matching the @sqlite.org/sqlite-wasm OO1 DB API we use. */
export interface DbLike {
    exec(opts: {
        sql: string;
        bind?: unknown[];
    }): void;
    selectObjects<T = Record<string, unknown>>(sql: string, bind?: unknown[]): T[];
}
export declare function initSchema(db: DbLike): void;
export declare function getDoc(db: DbLike, path: string): DocData | null;
export declare function setDoc(db: DbLike, path: string, data: DocData, merge?: boolean): void;
export declare function updateDoc(db: DbLike, path: string, data: DocData): void;
export declare function deleteDoc(db: DbLike, path: string): void;
export declare function addDoc(db: DbLike, collectionPath: string, data: DocData): string;
/** Returns direct children of a collection (no sub-collections). */
export declare function getCollection(db: DbLike, collectionPath: string): DocEntry[];
//# sourceMappingURL=sql.d.ts.map