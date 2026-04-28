import type { WorkerRequest, WorkerResponse, RawSnapshot } from './types';

type SnapshotCallback = (snapshot: RawSnapshot) => void;
type PendingRequest = { resolve: (v: unknown) => void; reject: (e: Error) => void };
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export class FirelocalClient {
  private port: MessagePort;
  private pending = new Map<string, PendingRequest>();
  private subscriptions = new Map<string, SnapshotCallback>();

  constructor(workerUrl: string | URL) {
    console.log('[client] creating SharedWorker', String(workerUrl));
    const worker = new SharedWorker(workerUrl, { type: 'module', name: 'firelocal' });
    worker.onerror = (e) => console.error('[client] SharedWorker error:', e);
    this.port = worker.port;
    this.port.addEventListener('message', this.onMessage.bind(this));
    this.port.start();
    console.log('[client] port started');
  }

  private onMessage(event: MessageEvent<WorkerResponse>): void {
    const msg = event.data;
    console.log('[client] received:', msg.type, msg);
    if (msg.type === 'RESULT') {
      const p = this.pending.get(msg.id);
      if (!p) console.warn('[client] no pending request for id', msg.id);
      p?.resolve(msg.data);
      this.pending.delete(msg.id);
    } else if (msg.type === 'ERROR') {
      console.error('[client] worker error:', msg.error);
      const p = this.pending.get(msg.id);
      p?.reject(new Error(msg.error));
      this.pending.delete(msg.id);
    } else if (msg.type === 'SNAPSHOT') {
      const cb = this.subscriptions.get(msg.subId);
      if (!cb) console.warn('[client] no subscription for subId', msg.subId);
      cb?.(msg.snapshot);
    }
  }

  request(msg: DistributiveOmit<Extract<WorkerRequest, { id: string }>, 'id'>): Promise<unknown> {
    const id = crypto.randomUUID();
    console.log('[client] sending request:', (msg as any).type, { ...msg, id });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.port.postMessage({ ...msg, id });
    });
  }

  subscribe(
    type: 'SUBSCRIBE_DOC' | 'SUBSCRIBE_QUERY',
    params: object,
    callback: SnapshotCallback,
  ): () => void {
    const subId = crypto.randomUUID();
    console.log('[client] subscribing:', type, params, 'subId:', subId);
    this.subscriptions.set(subId, callback);
    this.port.postMessage({ type, subId, ...params });
    return () => {
      this.subscriptions.delete(subId);
      this.port.postMessage({ type: 'UNSUBSCRIBE', subId });
    };
  }
}
