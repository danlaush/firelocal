export class FirelocalClient {
    port;
    pending = new Map();
    subscriptions = new Map();
    constructor(workerUrl) {
        console.log('[client] creating Worker', String(workerUrl));
        const worker = new Worker(workerUrl, { type: 'module', name: 'firelocal' });
        worker.onerror = (e) => console.error('[client] Worker error:', e);
        this.port = worker;
        this.port.addEventListener('message', this.onMessage.bind(this));
        console.log('[client] worker started');
    }
    onMessage(event) {
        const msg = event.data;
        console.log('[client] received:', msg.type, msg);
        if (msg.type === 'RESULT') {
            const p = this.pending.get(msg.id);
            if (!p)
                console.warn('[client] no pending request for id', msg.id);
            p?.resolve(msg.data);
            this.pending.delete(msg.id);
        }
        else if (msg.type === 'ERROR') {
            console.error('[client] worker error:', msg.error);
            const p = this.pending.get(msg.id);
            p?.reject(new Error(msg.error));
            this.pending.delete(msg.id);
        }
        else if (msg.type === 'SNAPSHOT') {
            const cb = this.subscriptions.get(msg.subId);
            if (!cb)
                console.warn('[client] no subscription for subId', msg.subId);
            cb?.(msg.snapshot);
        }
    }
    request(msg) {
        const id = crypto.randomUUID();
        console.log('[client] sending request:', msg.type, { ...msg, id });
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.port.postMessage({ ...msg, id });
        });
    }
    subscribe(type, params, callback) {
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
//# sourceMappingURL=client.js.map