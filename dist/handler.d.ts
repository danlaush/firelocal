import type { DbLike } from './sql';
import type { WorkerRequest, WorkerResponse, RawSnapshot } from './types';
export type Subscription = {
    type: 'doc';
    subId: string;
    path: string;
    notify: (snap: RawSnapshot) => void;
} | {
    type: 'query';
    subId: string;
    collectionPath: string;
    constraints: import('./types').Constraint[];
    notify: (snap: RawSnapshot) => void;
};
export interface HandlerContext {
    db: DbLike;
    subscriptions: Map<string, Subscription>;
}
export declare function createContext(db: DbLike): HandlerContext;
export declare function handleMessage(ctx: HandlerContext, msg: WorkerRequest, respond: (response: WorkerResponse) => void): void;
//# sourceMappingURL=handler.d.ts.map