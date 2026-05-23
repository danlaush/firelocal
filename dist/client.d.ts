import type { WorkerRequest, RawSnapshot } from './types';
type SnapshotCallback = (snapshot: RawSnapshot) => void;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export declare class FirelocalClient {
    private port;
    private pending;
    private subscriptions;
    constructor(workerOrUrl: string | URL | Worker);
    private onMessage;
    request(msg: DistributiveOmit<Extract<WorkerRequest, {
        id: string;
    }>, 'id'>): Promise<unknown>;
    subscribe(type: 'SUBSCRIBE_DOC' | 'SUBSCRIBE_QUERY', params: object, callback: SnapshotCallback): () => void;
}
export {};
//# sourceMappingURL=client.d.ts.map