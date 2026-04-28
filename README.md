# firelocal

A browser-local drop-in replacement for the Firebase Firestore real-time API. Stores data in SQLite WASM via a SharedWorker, replicating Firestore's push-subscription model without any network dependency.

## Why

- No Firebase project, auth, or quotas needed
- Works fully offline
- Persistent across page navigations (SharedWorker lifetime)
- Reactive: subscribers receive pushed updates when data changes, same as `onSnapshot`

## API surface

Mirrors Firebase's modular v9+ API:

```ts
import { initFirelocal, getDb } from 'firelocal';
import { doc, collection, getDoc, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot, query, where, orderBy } from 'firelocal';

const app = initFirelocal();
const db  = getDb(app);

// Read
const snap = await getDoc(doc(db, 'designs', 'abc'));
console.log(snap.data());

// Write
await setDoc(doc(db, 'designs', 'abc'), { title: 'My doc', refs: [] });
await updateDoc(doc(db, 'designs', 'abc'), { title: 'Updated' });
await deleteDoc(doc(db, 'designs', 'abc'));
const ref = await addDoc(collection(db, 'designs'), { title: 'New' });

// Real-time subscription (push-based, same as Firestore onSnapshot)
const unsub = onSnapshot(doc(db, 'designs', 'abc'), (snap) => {
  console.log(snap.data()); // called immediately, then on every change
});
unsub(); // stop listening

// Collection query subscription
const unsub2 = onSnapshot(
  query(collection(db, 'designs'), where('status', '==', 'crawled'), orderBy('title')),
  (snap) => snap.docs.forEach(d => console.log(d.id, d.data()))
);
```

## Architecture

```
Main thread                     SharedWorker
────────────────                ─────────────────────────────────
FirelocalClient  ─postMessage─► MessageHandler
  doc/collection                  │
  getDoc/setDoc/…                 ├─► SQLite WASM (single DB instance)
  onSnapshot ──────subscribe──►   │     documents table (path, data JSON)
                ◄──snapshot push─ └─► SubscriptionRegistry
                                        watches affected paths on writes
```

All SQLite access lives exclusively in the SharedWorker, preventing concurrent write conflicts. The worker fans out snapshot events to all subscribed ports when data changes.

## Project structure

```
src/
  worker.ts          SharedWorker entry point (SQLite + subscriptions)
  client.ts          Main-thread client (postMessage bridge)
  index.ts           Public API (Firebase-compatible functions)
  types.ts           Shared message protocol and public types
  sql.ts             SQLite schema and query helpers
  query.ts           where/orderBy/limit constraint logic
example/
  index.html         Simple interactive demo
  app.ts             Demo app using the firelocal API
tests/
  unit/              Jest/Vitest unit tests (mock worker)
  integration/       End-to-end tests in a real browser worker context
```
