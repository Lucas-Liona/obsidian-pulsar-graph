import { App, TFile } from 'obsidian';

/**
 * Reading core File Recovery's snapshots for their timestamps.
 *
 * File Recovery keeps a copy of every note it has seen change, in an IndexedDB
 * database of its own. Pulsar's own log starts empty on the day it is switched
 * on, and this is the only local record of anything before that — so it is worth
 * one import, as a seed, and nothing more. It is capped at seven days by
 * default, absent entirely on iOS and covers only md, canvas and base files, so
 * it can never be the thing the history is built on.
 *
 * **Nothing here reads a note's contents.** Each record holds the note's text in
 * a `data` field, and this never touches it. The two indexes are walked with
 * `openKeyCursor`, which yields an `IDBCursor` rather than an
 * `IDBCursorWithValue` — an object with no `value` property on it at all, so the
 * text is not merely left alone, it is unreachable from here. Joining the `path`
 * and `ts` cursors on their shared `primaryKey` gives every pair of path and
 * timestamp without a single record being opened.
 */

/** `appId` is how Obsidian names a vault's databases. Not in the public types. */
interface AppWithId extends App {
    appId?: string;
}

const STORE = 'backups';

export interface Snapshots {
    /** Every snapshot time File Recovery holds, per note, oldest first. */
    byPath: Map<string, number[]>;
    /** How many snapshots that was, before notes the vault no longer has. */
    records: number;
    /** Notes it holds snapshots for that are not in the vault any more. */
    skipped: number;
}

/**
 * What File Recovery has, or null when there is nothing to read: the plugin is
 * off, this is a platform without it, or the database has not been made yet.
 *
 * The name is built from `app.appId` rather than by looking for a database whose
 * name ends in `-backup`. One Obsidian install holds one of these per vault it
 * has ever opened — this one has eight — so searching by suffix is how you end
 * up importing another vault's note paths into this one. Both Dataview and
 * Omnisearch key their own databases the same way, for the same reason.
 */
export async function readSnapshots(app: App): Promise<Snapshots | null> {
    const database = await openBackups(app);
    if (!database) {
        return null;
    }

    try {
        const store = database.transaction(STORE, 'readonly').objectStore(STORE);

        if (!store.indexNames.contains('path') || !store.indexNames.contains('ts')) {
            return null;
        }

        const [paths, times] = await Promise.all([
            readKeys(store.index('path')),
            readKeys(store.index('ts'))
        ]);

        // Only notes the vault still has. A snapshot of something deleted would
        // give history to a note that is not there to show it.
        const present = new Set(
            app.vault.getMarkdownFiles().map((file: TFile) => file.path)
        );

        const byPath = new Map<string, number[]>();
        let records = 0;
        let skipped = 0;

        for (const [id, path] of paths) {
            const at = times.get(id);

            if (typeof path !== 'string' || typeof at !== 'number') {
                continue;
            }

            if (!present.has(path)) {
                skipped++;
                continue;
            }

            records++;
            const list = byPath.get(path);

            if (list) {
                list.push(at);
            } else {
                byPath.set(path, [at]);
            }
        }

        for (const list of byPath.values()) {
            list.sort((left, right) => left - right);
        }

        return { byPath, records, skipped };
    } catch {
        return null;
    } finally {
        database.close();
    }
}

/**
 * Opens the database only if it is already there, and only at the version it is
 * already at.
 *
 * Opening with a version of our own would run an upgrade, and File Recovery's
 * own upgrade drops and recreates the store — so a wrong version here would
 * destroy exactly the thing being read. Opening a name that does not exist
 * creates it, which would leave an empty database behind on a vault that has
 * File Recovery switched off, so existence is checked first.
 */
async function openBackups(app: App): Promise<IDBDatabase | null> {
    const appId = (app as AppWithId).appId;

    if (typeof appId !== 'string' || appId.length === 0) {
        return null;
    }

    const name = `${appId}-backup`;

    try {
        const existing = await indexedDB.databases();

        if (!existing.some((entry) => entry.name === name)) {
            return null;
        }
    } catch {
        // Some platforms do not offer databases(). Without it there is no way
        // to ask whether this exists without creating it, so nothing is read.
        return null;
    }

    return new Promise<IDBDatabase | null>((resolve) => {
        const request = indexedDB.open(name);

        request.onsuccess = (): void => {
            const database = request.result;
            resolve(database.objectStoreNames.contains(STORE) ? database : null);
        };

        request.onerror = (): void => resolve(null);
        request.onblocked = (): void => resolve(null);

        // Only fires if the database turned out not to exist after all, in
        // which case this call is creating it. Let it go no further.
        request.onupgradeneeded = (): void => {
            request.transaction?.abort();
            resolve(null);
        };
    });
}

/**
 * Every (primary key, indexed key) pair in an index, read with a key cursor so
 * no record is ever opened.
 */
function readKeys(index: IDBIndex): Promise<Map<IDBValidKey, IDBValidKey>> {
    return new Promise((resolve) => {
        const found = new Map<IDBValidKey, IDBValidKey>();
        const request = index.openKeyCursor();

        request.onsuccess = (): void => {
            const cursor = request.result;

            if (!cursor) {
                resolve(found);
                return;
            }

            found.set(cursor.primaryKey, cursor.key);
            cursor.continue();
        };

        request.onerror = (): void => resolve(found);
    });
}
