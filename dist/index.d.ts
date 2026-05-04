import { FirelocalClient } from './client';
import type { Constraint, WhereOp, DocData } from './types';
export type FirelocalApp = {
    client: FirelocalClient;
};
export type FirelocalDb = {
    app: FirelocalApp;
};
export declare function initFirelocal(workerUrl?: string | URL): FirelocalApp;
export declare function getDb(app: FirelocalApp): FirelocalDb;
export type DocumentReference = {
    _kind: 'doc';
    db: FirelocalDb;
    path: string;
};
export type CollectionReference = {
    _kind: 'col';
    db: FirelocalDb;
    path: string;
};
export type FirelocalQuery = {
    _kind: 'query';
    ref: CollectionReference;
    constraints: Constraint[];
};
export declare function doc(db: FirelocalDb, ...segments: string[]): DocumentReference;
export declare function collection(db: FirelocalDb, ...segments: string[]): CollectionReference;
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
export declare function getDoc(ref: DocumentReference): Promise<DocumentSnapshot>;
export declare function getDocs(q: FirelocalQuery | CollectionReference): Promise<QuerySnapshot>;
export declare function setDoc(ref: DocumentReference, data: DocData, options?: {
    merge?: boolean;
}): Promise<void>;
export declare function addDoc(ref: CollectionReference, data: DocData): Promise<DocumentReference>;
export declare function updateDoc(ref: DocumentReference, data: DocData): Promise<void>;
export declare function deleteDoc(ref: DocumentReference): Promise<void>;
export declare function onSnapshot(ref: DocumentReference, callback: (snap: DocumentSnapshot) => void): () => void;
export declare function onSnapshot(ref: CollectionReference | FirelocalQuery, callback: (snap: QuerySnapshot) => void): () => void;
export declare function query(ref: CollectionReference, ...constraints: Constraint[]): FirelocalQuery;
export declare function where(field: string, op: WhereOp, value: unknown): Constraint;
export declare function orderBy(field: string, dir?: 'asc' | 'desc'): Constraint;
export declare function limit(n: number): Constraint;
//# sourceMappingURL=index.d.ts.map