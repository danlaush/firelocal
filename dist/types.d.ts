export type WhereOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'array-contains' | 'in' | 'not-in';
export type Constraint = {
    type: 'where';
    field: string;
    op: WhereOp;
    value: unknown;
} | {
    type: 'orderBy';
    field: string;
    dir: 'asc' | 'desc';
} | {
    type: 'limit';
    n: number;
};
export type DocData = Record<string, unknown>;
export type WorkerRequest = {
    type: 'GET_DOC';
    id: string;
    path: string;
} | {
    type: 'SET_DOC';
    id: string;
    path: string;
    data: DocData;
    merge?: boolean;
} | {
    type: 'ADD_DOC';
    id: string;
    collectionPath: string;
    data: DocData;
} | {
    type: 'UPDATE_DOC';
    id: string;
    path: string;
    data: DocData;
} | {
    type: 'DELETE_DOC';
    id: string;
    path: string;
} | {
    type: 'GET_COLLECTION';
    id: string;
    collectionPath: string;
    constraints: Constraint[];
} | {
    type: 'SUBSCRIBE_DOC';
    subId: string;
    path: string;
} | {
    type: 'SUBSCRIBE_QUERY';
    subId: string;
    collectionPath: string;
    constraints: Constraint[];
} | {
    type: 'UNSUBSCRIBE';
    subId: string;
};
export type WorkerResponse = {
    type: 'RESULT';
    id: string;
    data: unknown;
} | {
    type: 'ERROR';
    id: string;
    error: string;
} | {
    type: 'SNAPSHOT';
    subId: string;
    snapshot: RawSnapshot;
};
export type RawDocSnapshot = {
    kind: 'doc';
    path: string;
    data: DocData | null;
};
export type RawQuerySnapshot = {
    kind: 'query';
    docs: Array<{
        path: string;
        data: DocData;
    }>;
};
export type RawSnapshot = RawDocSnapshot | RawQuerySnapshot;
//# sourceMappingURL=types.d.ts.map