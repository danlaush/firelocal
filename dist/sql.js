export function initSchema(db) {
    db.exec({
        sql: `
      CREATE TABLE IF NOT EXISTS documents (
        path       TEXT    PRIMARY KEY,
        data       TEXT    NOT NULL DEFAULT '{}',
        updated_at INTEGER NOT NULL
      )
    `,
    });
}
export function getDoc(db, path) {
    const rows = db.selectObjects('SELECT data FROM documents WHERE path = ?', [path]);
    if (rows.length === 0)
        return null;
    return JSON.parse(rows[0].data);
}
export function setDoc(db, path, data, merge = false) {
    const toWrite = merge ? { ...(getDoc(db, path) ?? {}), ...data } : data;
    db.exec({
        sql: 'INSERT OR REPLACE INTO documents (path, data, updated_at) VALUES (?, ?, ?)',
        bind: [path, JSON.stringify(toWrite), Date.now()],
    });
}
export function updateDoc(db, path, data) {
    const existing = getDoc(db, path);
    if (existing === null)
        throw new Error(`No document at path: ${path}`);
    setDoc(db, path, { ...existing, ...data });
}
export function deleteDoc(db, path) {
    db.exec({ sql: 'DELETE FROM documents WHERE path = ?', bind: [path] });
}
export function addDoc(db, collectionPath, data) {
    const id = crypto.randomUUID();
    const path = `${collectionPath}/${id}`;
    setDoc(db, path, data);
    return path;
}
/** Returns direct children of a collection (no sub-collections). */
export function getCollection(db, collectionPath) {
    const rows = db.selectObjects(`SELECT path, data FROM documents WHERE path LIKE ? AND path NOT LIKE ?`, [`${collectionPath}/%`, `${collectionPath}/%/%`]);
    return rows.map((r) => ({ path: r.path, data: JSON.parse(r.data) }));
}
//# sourceMappingURL=sql.js.map