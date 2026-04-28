import {
  initFirelocal, getDb,
  doc, collection,
  getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy,
} from '../src/index';

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

const workerUrl = new URL('../src/worker.ts', import.meta.url);
console.log('[app] worker URL:', workerUrl.href);

const app = initFirelocal(workerUrl);
console.log('[app] firelocal app created');

const db = getDb(app);
const designsCol = collection(db, 'designs');
console.log('[app] db and collection ready');

// ---------------------------------------------------------------------------
// Log
// ---------------------------------------------------------------------------

function log(tag: 'snapshot' | 'write' | 'error', msg: string) {
  const el = document.getElementById('log')!;
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  const now = new Date().toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  entry.innerHTML = `<span class="time">${now}</span><span class="tag tag-${tag}">${tag}</span><span class="msg">${msg}</span>`;
  el.prepend(entry);
}

function setStatus(id: string, msg: string, isError = false) {
  const el = document.getElementById(id)!;
  el.textContent = msg;
  el.className = `status${isError ? ' error' : ''}`;
  setTimeout(() => { el.textContent = ''; }, 3000);
}

// ---------------------------------------------------------------------------
// Live collection subscription
// ---------------------------------------------------------------------------

let selectedPath: string | null = null;

console.log('[app] registering collection onSnapshot');
onSnapshot(query(designsCol, orderBy('title')), (snap) => {
  console.log('[app] onSnapshot fired, size:', snap.size);
  const list = document.getElementById('doc-list')!;
  const count = document.getElementById('doc-count')!;
  count.textContent = `(${snap.size})`;

  if (snap.empty) {
    list.innerHTML = '<div class="empty-state">No documents</div>';
    return;
  }

  list.innerHTML = '';
  snap.forEach((docSnap) => {
    const card = document.createElement('div');
    card.className = `doc-card${docSnap.ref.path === selectedPath ? ' selected' : ''}`;
    card.innerHTML = `
      <div class="doc-id">${docSnap.id}</div>
      <div class="doc-data">${JSON.stringify(docSnap.data(), null, 2)}</div>
    `;
    card.addEventListener('click', () => {
      selectedPath = docSnap.ref.path;
      // Pre-fill update/delete/get fields with this doc's path
      (document.getElementById('update-path') as HTMLInputElement).value = docSnap.ref.path;
      (document.getElementById('delete-path') as HTMLInputElement).value = docSnap.ref.path;
      (document.getElementById('get-path') as HTMLInputElement).value = docSnap.ref.path;
      (document.getElementById('set-path') as HTMLInputElement).value = docSnap.ref.path;
      (document.getElementById('set-data') as HTMLTextAreaElement).value = JSON.stringify(docSnap.data(), null, 2);
      list.querySelectorAll('.doc-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
    });
    list.appendChild(card);
  });

  log('snapshot', `designs/ → ${snap.size} doc(s)`);
});

// ---------------------------------------------------------------------------
// Button wires
// ---------------------------------------------------------------------------

function getInputVal(id: string): string {
  return (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement).value.trim();
}

function parseJson(id: string): Record<string, unknown> | null {
  try {
    return JSON.parse(getInputVal(id));
  } catch {
    return null;
  }
}

// setDoc
document.getElementById('btn-set')!.addEventListener('click', async () => {
  console.log('[app] btn-set clicked');
  const path = getInputVal('set-path');
  const data = parseJson('set-data');
  if (!path || !data) return setStatus('status-set', 'Invalid path or JSON', true);
  try {
    console.log('[app] calling setDoc', path, data);
    await setDoc(doc(db, path), data);
    console.log('[app] setDoc resolved');
    log('write', `setDoc(${path})`);
    setStatus('status-set', 'OK');
  } catch (e) {
    setStatus('status-set', String(e), true);
  }
});

// setDoc merge
document.getElementById('btn-set-merge')!.addEventListener('click', async () => {
  const path = getInputVal('set-path');
  const data = parseJson('set-data');
  if (!path || !data) return setStatus('status-set', 'Invalid path or JSON', true);
  try {
    await setDoc(doc(db, path), data, { merge: true });
    log('write', `setDoc(${path}, merge)`);
    setStatus('status-set', 'OK (merged)');
  } catch (e) {
    setStatus('status-set', String(e), true);
  }
});

// addDoc
document.getElementById('btn-add')!.addEventListener('click', async () => {
  const col = getInputVal('add-col');
  const data = parseJson('add-data');
  if (!col || !data) return setStatus('status-add', 'Invalid collection or JSON', true);
  try {
    const ref = await addDoc(collection(db, col), data);
    log('write', `addDoc → ${ref.path}`);
    setStatus('status-add', `Created: ${ref.path.split('/').pop()}`);
  } catch (e) {
    setStatus('status-add', String(e), true);
  }
});

// updateDoc
document.getElementById('btn-update')!.addEventListener('click', async () => {
  const path = getInputVal('update-path');
  const data = parseJson('update-data');
  if (!path || !data) return setStatus('status-update', 'Invalid path or JSON', true);
  try {
    await updateDoc(doc(db, path), data);
    log('write', `updateDoc(${path})`);
    setStatus('status-update', 'OK');
  } catch (e) {
    setStatus('status-update', String(e), true);
  }
});

// deleteDoc
document.getElementById('btn-delete')!.addEventListener('click', async () => {
  const path = getInputVal('delete-path');
  if (!path) return setStatus('status-delete', 'No path', true);
  try {
    await deleteDoc(doc(db, path));
    log('write', `deleteDoc(${path})`);
    setStatus('status-delete', 'Deleted');
    if (selectedPath === path) selectedPath = null;
  } catch (e) {
    setStatus('status-delete', String(e), true);
  }
});

// getDoc (one-shot)
document.getElementById('btn-get')!.addEventListener('click', async () => {
  const path = getInputVal('get-path');
  if (!path) return setStatus('status-get', 'No path', true);
  try {
    const snap = await getDoc(doc(db, path));
    if (snap.exists()) {
      log('snapshot', `getDoc(${path}) → ${JSON.stringify(snap.data())}`);
      setStatus('status-get', 'Found — see log');
    } else {
      log('snapshot', `getDoc(${path}) → does not exist`);
      setStatus('status-get', 'Does not exist');
    }
  } catch (e) {
    setStatus('status-get', String(e), true);
  }
});

// getDocs (filtered)
document.getElementById('btn-query')!.addEventListener('click', async () => {
  const col = getInputVal('query-col');
  const field = getInputVal('query-field');
  const op = getInputVal('query-op') as any;
  let value: unknown;
  try { value = JSON.parse(getInputVal('query-val')); }
  catch { return setStatus('status-query', 'Invalid JSON value', true); }

  try {
    const snap = await getDocs(query(collection(db, col), where(field, op, value)));
    log('snapshot', `getDocs(${col} where ${field} ${op} ${JSON.stringify(value)}) → ${snap.size} result(s)`);
    setStatus('status-query', `${snap.size} result(s) — see log`);
  } catch (e) {
    setStatus('status-query', String(e), true);
  }
});

// Crawl simulation
document.getElementById('btn-crawl')!.addEventListener('click', async () => {
  const btn = document.getElementById('btn-crawl') as HTMLButtonElement;
  btn.disabled = true;
  setStatus('status-crawl', 'Crawling…');

  const ids = Array.from({ length: 5 }, (_, i) => `crawled-${Date.now()}-${i}`);

  for (let i = 0; i < ids.length; i++) {
    await new Promise((r) => setTimeout(r, 600));
    const id = ids[i]!;
    const nextId = ids[i + 1];
    await setDoc(doc(db, `designs/${id}`), {
      title: `Crawled Doc ${i + 1}`,
      status: 'crawled',
      refs: nextId ? [`designs/${nextId}`] : [],
      crawledAt: Date.now(),
    });
    setStatus('status-crawl', `Wrote ${i + 1}/5…`);
  }

  setStatus('status-crawl', 'Done — 5 docs written');
  btn.disabled = false;
});

// Clear all designs
document.getElementById('btn-clear')!.addEventListener('click', async () => {
  const snap = await getDocs(designsCol);
  for (const d of snap.docs) {
    await deleteDoc(d.ref);
  }
  log('write', `Deleted ${snap.size} docs from designs/`);
});
