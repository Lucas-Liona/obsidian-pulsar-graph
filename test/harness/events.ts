import type { EventRef } from 'obsidian';

/** What a listener is called with. Obsidian's events carry whatever each one carries. */
export type Listener = (...data: unknown[]) => unknown;

/**
 * How each reference is detached. Obsidian keeps the emitter on the reference
 * itself and `Component.registerEvent` calls `ref.e.offref(ref)`; `EventRef` is
 * opaque in the declarations, so the fake keeps the same link here instead.
 */
const detachers = new WeakMap<EventRef, () => void>();

/** Takes a listener off whatever it was registered with, as `offref` does. */
export function detach(ref: EventRef): void {
    detachers.get(ref)?.();
    detachers.delete(ref);
}

/**
 * Obsidian's `Events`: named listeners called in the order they were added,
 * synchronously, on `trigger`. A listener added or removed while an event is
 * being delivered does not change who that delivery reaches.
 */
export class FakeEvents {
    private readonly listeners = new Map<string, Set<Listener>>();

    on(name: string, callback: Listener): EventRef {
        let named = this.listeners.get(name);

        if (!named) {
            named = new Set();
            this.listeners.set(name, named);
        }

        // A fresh function per registration, so registering the same
        // callback twice is two listeners, as it is in Obsidian.
        const listener: Listener = (...data) => callback(...data);
        named.add(listener);

        const ref: EventRef = {};
        detachers.set(ref, () => named.delete(listener));

        return ref;
    }

    offref(ref: EventRef): void {
        detach(ref);
    }

    trigger(name: string, ...data: unknown[]): void {
        for (const listener of [...(this.listeners.get(name) ?? [])]) {
            listener(...data);
        }
    }

    /** How many listeners an event has, for checking that unloading takes them all. */
    listenerCount(name?: string): number {
        if (name !== undefined) {
            return this.listeners.get(name)?.size ?? 0;
        }

        let total = 0;

        for (const named of this.listeners.values()) {
            total += named.size;
        }

        return total;
    }
}
