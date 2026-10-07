/**
 * Synthetic vaults for tests and benchmarks: paths, modification times and a
 * brightness for each, from a seeded generator so a failing case can be rerun.
 */
export interface FakeVault {
    mtimes: Map<string, number>;
    strengths: Map<string, number>;
}

/** Mulberry32: small, fast, and the same sequence for the same seed. */
export function seeded(seed: number): () => number {
    let state = seed >>> 0;

    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * A vault of `size` notes over a year, shaped like a real one: most notes old,
 * a long tail of recent work, and a block imported at a single instant —
 * which is what a migration from another app looks like.
 */
export function fakeVault(size: number, seed = 1, now = Date.UTC(2026, 9, 7)): FakeVault {
    const random = seeded(seed);
    const year = 365 * 24 * 60 * 60 * 1000;
    const imported = now - 0.8 * year;
    const mtimes = new Map<string, number>();
    const strengths = new Map<string, number>();

    for (let index = 0; index < size; index++) {
        const path = `notes/${index}.md`;
        const mtime = random() < 0.3 ? imported : now - year * random() ** 2.5;

        mtimes.set(path, mtime);
        // Above 1 for the newest, as a maximum opacity above 1 produces.
        strengths.set(path, 0.05 + 2.47 * (1 - (now - mtime) / year) ** 3);
    }

    return { mtimes, strengths };
}

/** The newest few, the way the spotlight picks them. */
export function newest(mtimes: Map<string, number>, count: number): string[] {
    return [...mtimes].sort((a, b) => b[1] - a[1]).slice(0, count).map(([path]) => path);
}
