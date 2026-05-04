/**
 * Core message handler for the SharedWorker.
 * Extracted as a pure function so it can be unit-tested without a real worker.
 */
import { getDoc, setDoc, updateDoc, deleteDoc, addDoc, getCollection } from './sql';
import { applyConstraints } from './query';
export function createContext(db) {
    return { db, subscriptions: new Map() };
}
export function handleMessage(ctx, msg, respond) {
    const { db, subscriptions } = ctx;
    try {
        switch (msg.type) {
            case 'GET_DOC': {
                const data = getDoc(db, msg.path);
                respond({ type: 'RESULT', id: msg.id, data });
                break;
            }
            case 'SET_DOC': {
                setDoc(db, msg.path, msg.data, msg.merge);
                respond({ type: 'RESULT', id: msg.id, data: null });
                notifySubscribers(ctx, msg.path);
                break;
            }
            case 'UPDATE_DOC': {
                updateDoc(db, msg.path, msg.data);
                respond({ type: 'RESULT', id: msg.id, data: null });
                notifySubscribers(ctx, msg.path);
                break;
            }
            case 'DELETE_DOC': {
                deleteDoc(db, msg.path);
                respond({ type: 'RESULT', id: msg.id, data: null });
                notifySubscribers(ctx, msg.path);
                break;
            }
            case 'ADD_DOC': {
                const path = addDoc(db, msg.collectionPath, msg.data);
                respond({ type: 'RESULT', id: msg.id, data: { path } });
                notifySubscribers(ctx, path);
                break;
            }
            case 'GET_COLLECTION': {
                const docs = applyConstraints(getCollection(db, msg.collectionPath), msg.constraints);
                respond({ type: 'RESULT', id: msg.id, data: docs });
                break;
            }
            case 'SUBSCRIBE_DOC': {
                const notify = (snap) => respond({ type: 'SNAPSHOT', subId: msg.subId, snapshot: snap });
                subscriptions.set(msg.subId, { type: 'doc', subId: msg.subId, path: msg.path, notify });
                // Fire initial snapshot immediately
                const data = getDoc(db, msg.path);
                notify({ kind: 'doc', path: msg.path, data });
                break;
            }
            case 'SUBSCRIBE_QUERY': {
                const notify = (snap) => respond({ type: 'SNAPSHOT', subId: msg.subId, snapshot: snap });
                subscriptions.set(msg.subId, {
                    type: 'query',
                    subId: msg.subId,
                    collectionPath: msg.collectionPath,
                    constraints: msg.constraints,
                    notify,
                });
                // Fire initial snapshot immediately
                const docs = applyConstraints(getCollection(db, msg.collectionPath), msg.constraints);
                notify({ kind: 'query', docs });
                break;
            }
            case 'UNSUBSCRIBE': {
                subscriptions.delete(msg.subId);
                break;
            }
        }
    }
    catch (err) {
        if ('id' in msg) {
            respond({ type: 'ERROR', id: msg.id, error: String(err) });
        }
    }
}
function notifySubscribers(ctx, affectedPath) {
    const { db, subscriptions } = ctx;
    for (const sub of subscriptions.values()) {
        if (sub.type === 'doc' && sub.path === affectedPath) {
            const data = getDoc(db, affectedPath);
            sub.notify({ kind: 'doc', path: affectedPath, data });
        }
        else if (sub.type === 'query') {
            const prefix = sub.collectionPath + '/';
            // Only react if the affected path is a direct child of this collection
            const remainder = affectedPath.startsWith(prefix) ? affectedPath.slice(prefix.length) : null;
            if (remainder !== null && !remainder.includes('/')) {
                const docs = applyConstraints(getCollection(db, sub.collectionPath), sub.constraints);
                sub.notify({ kind: 'query', docs });
            }
        }
    }
}
//# sourceMappingURL=handler.js.map