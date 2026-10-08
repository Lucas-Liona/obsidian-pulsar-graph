import { App, debounce, Notice, normalizePath, Plugin } from 'obsidian';

/**
 * One sitting with a note: a run of writes with no gap in it longer than the
 * session gap. Obsidian autosaves roughly every two seconds while you type, so
 * raw writes are useless as history — half an hour of writing is hundreds of
 * them. A sitting is the unit anyone would describe out loud.
 *
 * The sizes are the note's length at each end of the sitting, which is how much
 * it grew or shrank while you were in it.
 */
export interface Bead {
    start: number;
    end: number;
    sizeStart: number;
    sizeEnd: number;
}

/** How a bead is written down. Positional, which is ~40% smaller than keys. */
type StoredBead = [number, number, number, number];

/** What the history file knows about this vault overall. */
export interface Coverage {
    notes: number;
    beads: number;
    /** The start of the earliest sitting on record, or undefined if there is none. */
    oldest: number | undefined;
}

const FILE_NAME = 'history.json';

const FORMAT_VERSION = 1;

/**
 * How long to wait before writing. Any write under `.obsidian` wakes Obsidian
 * Sync's scanner even for a file Sync will then decline to upload, so this is
 * batched rather than written per edit. A crash costs at most the boundaries
 * inside the last sitting, never the sitting itself: a bead's timestamp is the
 * note's own mtime, so the next load can see what is missing and append it.
 */
const WRITE_DELAY_MS = 5 * 1000;

/**
 * How often an otherwise idle session records that it is still running.
 *
 * This exists for the attention clock rather than for the beads. Attention is
 * measured from when you last looked at a note, and the time Obsidian was shut
 * is not time you spent ignoring anything — so the gap has to be frozen while
 * the app is closed. That needs a recent record of the app being awake, and
 * without a heartbeat a long idle session would be mistaken for downtime and
 * every tab would read as freshly visited. Five minutes bounds that error, and
 * matches the cadence core File Recovery already writes at.
 */
const AWAKE_REFRESH_MS = 5 * 60 * 1000;

/**
 * When each note was worked on, kept because Obsidian keeps only the latest
 * modification time and throws the rest away.
 *
 * It lives in a file of its own rather than in `data.json`. `saveData` rewrites
 * the whole of `data.json` on every settings change, and Obsidian Sync merges
 * config JSON by replacing each top-level key with the remote's copy — so a log
 * nested under a key there loses every entry the other device has not seen.
 * This file is never synced, which is the right answer for a record of how you
 * worked on this machine, and it carries nothing but numbers.
 */
export class EditHistory {
    private readonly notes = new Map<string, Bead[]>();
    private readonly opened = new Map<string, number>();

    /** Top-level keys a newer version wrote, kept so a downgrade loses nothing. */
    private extra: Record<string, unknown> = {};

    /** The last moment a running session was written down. */
    private awake = 0;

    /** How long the app was shut between that moment and this load. */
    private closedFor = 0;

    private dirty = false;
    private loaded = false;
    /**
     * The file is there but could not be read. Nothing is written while this
     * holds: the only thing a write could do is replace a history this session
     * never saw.
     */
    private unreadable = false;
    /** Whether the user has been told, so a retry every heartbeat stays quiet. */
    private warned = false;
    private reading = false;
    private writing: Promise<void> = Promise.resolve();

    private readonly writeSoon = debounce(() => void this.write(), WRITE_DELAY_MS);

    constructor(private readonly app: App, private readonly plugin: Plugin) {}

    private get folder(): string {
        return normalizePath(`${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}`);
    }

    private get path(): string {
        return normalizePath(`${this.folder}/${FILE_NAME}`);
    }

    /**
     * Reads what is on disk.
     *
     * A file that is there but cannot be read is left alone. The cause is as
     * likely to be a lock held for a moment by sync or a virus scanner as
     * damage, and writing over it would replace months of sittings with
     * whatever this session had seen. Nothing is recorded or written until a
     * read succeeds; the heartbeat asks again.
     *
     * A file that reads but does not parse is damaged, so it is kept beside
     * the new one under a dated name before anything is written. History that
     * silently empties is indistinguishable from history that never started,
     * and that is the one failure this should not hide.
     */
    async load(): Promise<void> {
        this.loaded = true;

        let raw: string;

        try {
            if (!(await this.app.vault.adapter.exists(this.path))) {
                this.recovered();
                return;
            }

            raw = await this.app.vault.adapter.read(this.path);
        } catch {
            this.cannotRead('Pulsar could not read its edit history. It records nothing until it can, and will try again shortly.');
            return;
        }

        const stored = parseStored(raw);

        if (stored === null) {
            await this.keepDamaged(raw);
            return;
        }

        this.recovered();

        for (const [key, value] of Object.entries(stored)) {
            if (key !== 'v' && key !== 'notes' && key !== 'opened' && key !== 'awake') {
                this.extra[key] = value;
            }
        }

        readBeads(stored.notes, this.notes);
        readTimes(stored.opened, this.opened);

        this.awake = typeof stored.awake === 'number' ? stored.awake : 0;
        this.closedFor = this.awake > 0 ? Math.max(0, Date.now() - this.awake) : 0;
    }

    /** Stops recording and writing until a later read succeeds. */
    private cannotRead(message: string): void {
        this.loaded = false;
        this.unreadable = true;

        if (!this.warned) {
            this.warned = true;
            new Notice(message);
        }
    }

    private recovered(): void {
        this.unreadable = false;
        this.warned = false;
    }

    /**
     * Keeps a file that does not parse beside the new one, so starting again
     * loses nothing that was there. If there is nowhere to keep it, nothing is
     * written over it either.
     */
    private async keepDamaged(raw: string): Promise<void> {
        const name = `history.damaged-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

        try {
            await this.app.vault.adapter.write(normalizePath(`${this.folder}/${name}`), raw);
        } catch {
            this.cannotRead('Pulsar could not read its edit history or keep a copy of it. It records nothing until it can.');
            return;
        }

        this.recovered();
        new Notice(`Pulsar could not read its edit history. A copy is kept as ${name} in its plugin folder, and a new one has been started.`);
    }

    /**
     * How long the app was shut since the last session. The attention clock
     * shifts its stored times forward by this, so a week with Obsidian closed
     * costs a tab nothing while three days of ignoring it survives a restart.
     */
    downtime(): number {
        return this.closedFor;
    }

    /**
     * Records that a note was written. `mtime` rather than the current clock,
     * which is what makes a synced edit land on the day it was really made:
     * Sync writes a pulled note with the remote's own timestamp, so an edit made
     * on another device three days ago becomes a bead three days ago instead of
     * a fictional sitting now.
     */
    record(path: string, mtime: number, size: number, gapMs: number, cap: number): void {
        if (!this.loaded) {
            return;
        }

        const beads = this.notes.get(path) ?? [];
        const last = beads.at(-1);

        if (last) {
            // The same write arriving twice. Sync delivers one edit to every
            // device, and the vault fires modify for Obsidian's own autosave as
            // readily as for anything else.
            if (mtime <= last.end && size === last.sizeEnd) {
                return;
            }

            // Out of order, which only a pulled older copy produces. The
            // importer sorts what it inserts; a live event this old says less
            // than what is already written down.
            if (mtime < last.start) {
                return;
            }

            if (mtime - last.end <= gapMs) {
                last.end = Math.max(last.end, mtime);
                last.sizeEnd = size;
                this.touch();
                return;
            }
        }

        beads.push({ start: mtime, end: mtime, sizeStart: last?.sizeEnd ?? size, sizeEnd: size });

        // Bounded per note rather than by age. An age cap would delete exactly
        // the record this plugin exists to show: that something went quiet.
        if (beads.length > cap) {
            beads.splice(0, beads.length - cap);
        }

        this.notes.set(path, beads);
        this.touch();
    }

    /**
     * Folds timestamps from somewhere else into a note's history, coalescing
     * them into sittings exactly as live edits are. Used by the File Recovery
     * import, which is the only record of anything from before this plugin was
     * switched on.
     *
     * Safe to run twice: a timestamp that already falls inside a sitting merges
     * back into it rather than adding another.
     */
    merge(path: string, times: readonly number[], gapMs: number, cap: number): void {
        if (!this.loaded || times.length === 0) {
            return;
        }

        const all: Bead[] = [
            ...(this.notes.get(path) ?? []),
            ...times.map((at) => ({ start: at, end: at, sizeStart: 0, sizeEnd: 0 }))
        ];

        all.sort((left, right) => left.start - right.start);

        const merged: Bead[] = [];

        for (const bead of all) {
            const last = merged.at(-1);

            if (last && bead.start - last.end <= gapMs) {
                last.end = Math.max(last.end, bead.end);

                // Sizes are only known for sittings this plugin watched happen;
                // an imported one carries none. The merged sitting keeps
                // whatever real numbers either end had.
                if (hasSizes(bead)) {
                    const had = hasSizes(last);
                    last.sizeEnd = bead.sizeEnd;

                    if (!had) {
                        last.sizeStart = bead.sizeStart;
                    }
                }

                continue;
            }

            merged.push({ ...bead });
        }

        if (merged.length > cap) {
            merged.splice(0, merged.length - cap);
        }

        this.notes.set(path, merged);
        this.touch();
    }

    /** Remembers that a note was looked at, for the attention clock. */
    markSeen(path: string, at: number): void {
        if (!this.loaded) {
            return;
        }

        this.opened.set(path, at);
        this.touch();
    }

    /** When a note was last looked at, already shifted past the downtime. */
    seenAt(path: string): number | undefined {
        const seen = this.opened.get(path);
        return seen === undefined ? undefined : seen + this.closedFor;
    }

    beadsFor(path: string): readonly Bead[] {
        return this.notes.get(path) ?? [];
    }

    /** How many separate sittings a note has had on record. */
    sittings(path: string): number {
        return this.notes.get(path)?.length ?? 0;
    }

    coverage(): Coverage {
        let beads = 0;
        let oldest: number | undefined;

        for (const list of this.notes.values()) {
            beads += list.length;

            const first = list[0];

            if (first && (oldest === undefined || first.start < oldest)) {
                oldest = first.start;
            }
        }

        return { notes: this.notes.size, beads, oldest };
    }

    rename(oldPath: string, newPath: string): void {
        const beads = this.notes.get(oldPath);

        if (beads) {
            this.notes.delete(oldPath);
            this.notes.set(newPath, beads);
        }

        const seen = this.opened.get(oldPath);

        if (seen !== undefined) {
            this.opened.delete(oldPath);
            this.opened.set(newPath, seen);
        }

        if (beads || seen !== undefined) {
            this.touch();
        }
    }

    /**
     * Drops a note's history. Orphaned history grows without bound and answers
     * no question anyone asks, so a deleted note takes its beads with it.
     */
    forget(path: string): void {
        const had = this.notes.delete(path);
        const seen = this.opened.delete(path);

        if (had || seen) {
            this.touch();
        }
    }

    /**
     * Throws the lot away, at the user's request. The one write allowed over a
     * file that could not be read, since replacing it is what was asked for.
     */
    async clear(): Promise<void> {
        this.notes.clear();
        this.opened.clear();
        this.loaded = true;
        this.recovered();
        this.touch();
        await this.flush();
    }

    /**
     * Records that the session is still running, so the next load can tell idle
     * time from time the app was shut. Cheap enough to call on a short timer:
     * it only asks for a write once every few minutes. While the file cannot be
     * read, it tries the read again instead.
     */
    heartbeat(): void {
        if (this.unreadable) {
            void this.retry();
            return;
        }

        if (this.loaded && Date.now() - this.awake >= AWAKE_REFRESH_MS) {
            this.touch();
        }
    }

    private async retry(): Promise<void> {
        if (this.reading) {
            return;
        }

        this.reading = true;

        try {
            await this.load();
        } finally {
            this.reading = false;
        }
    }

    /**
     * Writes anything outstanding now, for unload and for app quit. A write
     * already under way counts as outstanding: returning before it lands is how
     * quitting leaves a file cut short.
     */
    async flush(): Promise<void> {
        this.writeSoon.cancel();
        await this.write();
        await this.writing;
    }

    private touch(): void {
        this.dirty = true;
        this.writeSoon();
    }

    private async write(): Promise<void> {
        // Left dirty, so whatever happened meanwhile is written once a read
        // succeeds.
        if (!this.dirty || this.unreadable) {
            return;
        }

        this.dirty = false;
        this.awake = Date.now();

        const payload = JSON.stringify({
            ...this.extra,
            v: FORMAT_VERSION,
            awake: this.awake,
            notes: writeBeads(this.notes),
            opened: Object.fromEntries(this.opened)
        });

        // Serialised, because two overlapping writes of a whole file can leave
        // the older one last.
        this.writing = this.writing.then(async () => {
            try {
                await this.app.vault.adapter.write(this.path, payload);
            } catch {
                // Nothing worth interrupting anyone over: the next write will
                // carry the same contents, and a bead is reconstructible from
                // the note's own mtime.
                this.dirty = true;
            }
        });

        await this.writing;
    }
}

/** The file's top level, or null when it is not the object this writes. */
function parseStored(raw: string): Record<string, unknown> | null {
    let parsed: unknown;

    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }

    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
}

/** Whether a sitting was watched happen, rather than imported after the fact. */
function hasSizes(bead: Bead): boolean {
    return bead.sizeStart !== 0 || bead.sizeEnd !== 0;
}

function readBeads(source: unknown, into: Map<string, Bead[]>): void {
    if (typeof source !== 'object' || source === null) {
        return;
    }

    for (const [path, list] of Object.entries(source as Record<string, unknown>)) {
        if (!Array.isArray(list)) {
            continue;
        }

        const beads: Bead[] = [];

        for (const entry of list) {
            if (!Array.isArray(entry) || entry.length < 4 || entry.some((value) => typeof value !== 'number')) {
                continue;
            }

            const [start, end, sizeStart, sizeEnd] = entry as StoredBead;
            beads.push({ start, end, sizeStart, sizeEnd });
        }

        if (beads.length > 0) {
            beads.sort((left, right) => left.start - right.start);
            into.set(path, beads);
        }
    }
}

function readTimes(source: unknown, into: Map<string, number>): void {
    if (typeof source !== 'object' || source === null) {
        return;
    }

    for (const [path, value] of Object.entries(source as Record<string, unknown>)) {
        if (typeof value === 'number') {
            into.set(path, value);
        }
    }
}

function writeBeads(notes: Map<string, Bead[]>): Record<string, StoredBead[]> {
    const out: Record<string, StoredBead[]> = {};

    for (const [path, beads] of notes) {
        out[path] = beads.map((bead) => [bead.start, bead.end, bead.sizeStart, bead.sizeEnd]);
    }

    return out;
}
