import { blendRgb, GraphLink, GraphRenderer, GraphTexture, GraphTextureFactory } from './graph';

/** What Obsidian dims an unrelated link to while something is hovered. */
const DIMMED = 0.2;

/** Distinct gradients kept on hand. Finer than the eye can read on a hairline. */
const RAMP_STEPS = 8;

/** Wide enough that stretching the ramp over a long link stays smooth. */
const RAMP_WIDTH = 64;

export type LinkRecency = 'off' | 'uniform' | 'gradient';

export interface TrailOptions {
    /** Two notes saved within this long of each other were worked on together. */
    gapMs: number;
    /** What such a link is painted, as a packed 0xRRGGBB. */
    rgb: number;
    /** How far toward that colour a trail goes. Below 1 keeps it off the eye. */
    strength: number;
}

/**
 * Carries note age into the links between notes.
 *
 * Links are drawn in one flat colour whatever their ends have been through,
 * which leaves the busiest half of the picture saying nothing about time. A
 * link is given the age of its livelier end, so the structure around recent
 * work comes forward, and in gradient mode it fades along its length from the
 * newer note to the older one.
 */
export class LinkShading {
    /** Indexed by `rampIndex`, so a frame never builds a string to look one up. */
    private readonly ramps: (GraphTexture | undefined)[] = [];
    private plainTexture: GraphTexture | undefined;
    private mode: LinkRecency = 'off';
    private trails: TrailOptions | null = null;
    private gradientsWork = true;

    /**
     * What each link was worked out to, by its place in the renderer's list.
     *
     * A link's brightness only moves when the notes' do, and this runs on every
     * frame over every link: 43,515 of them in the 20,000-note bench vault,
     * each needing two lookups by path and a ramp. So it is worked out once per
     * revision and read back from here; the frame only writes it. A slot is
     * trusted only while it still holds the same link, so a rebuild that
     * reuses the array, or puts a different link at an index, is caught link
     * by link rather than by watching the array.
     */
    private seen: (GraphLink | undefined)[] = [];
    /** The generation each slot was worked out in; a new revision is a new generation. */
    private seenIn = new Uint32Array(0);
    private generation = 1;
    private high = new Float64Array(0);
    private ramp: (GraphTexture | undefined)[] = [];
    /**
     * 1 where a link's two notes were saved within a sitting of each other.
     * Worked out with the rest, once per revision: asked every frame, it was
     * two lookups by path for each of 43,515 links in the bench vault, for an
     * answer that only changes when a note is saved.
     */
    private together = new Uint8Array(0);
    private revision: unknown = undefined;

    constructor(
        private readonly renderer: GraphRenderer,
        private readonly opacityOf: (id: string) => number | undefined,
        private readonly mtimeOf: (id: string) => number | undefined,
        /**
         * Anything that changes whenever `opacityOf` might answer differently.
         * Compared by identity once a frame.
         */
        private readonly revisionOf: () => unknown
    ) {}

    setMode(mode: LinkRecency): void {
        if (mode !== this.mode) {
            this.mode = mode;
            this.restoreTextures();
            this.forget();
        }
    }

    /**
     * Trails are shown by colour and age by brightness, so the two say
     * different things about the same link instead of competing for the one
     * channel. Obsidian eases a link's tint back on its own once this stops
     * writing it, so switching trails off needs nothing undone.
     */
    setTrails(trails: TrailOptions | null): void {
        // Only which links are trails needs working out again, and only when
        // trails come or go or the sitting changes length. The colour and its
        // strength are read on every frame.
        const recount = (trails === null) !== (this.trails === null) || trails?.gapMs !== this.trails?.gapMs;
        this.trails = trails;

        if (recount) {
            this.forget();
        }
    }

    /** Runs after a frame, where the renderer has just set every link's alpha. */
    sync(): void {
        if (this.mode === 'off' && !this.trails) {
            return;
        }

        const links = this.renderer.links ?? [];
        const revision = this.revisionOf();

        if (links.length !== this.seen.length) {
            this.seen = new Array<GraphLink | undefined>(links.length);
            this.seenIn = new Uint32Array(links.length);
            this.high = new Float64Array(links.length);
            this.ramp = new Array<GraphTexture | undefined>(links.length);
            this.together = new Uint8Array(links.length);
        }

        if (revision !== this.revision) {
            this.revision = revision;
            this.nextGeneration();
        }

        // What the renderer would have drawn a link at, recomputed rather than
        // read back: its own value is eased a tenth of the way per frame, so
        // scaling that would compound into something far darker than intended.
        // The same for every link but the hovered node's, so worked out once.
        const highlight = this.renderer.getHighlightNode?.() ?? null;
        const colors = this.renderer.colors;
        const lineAlpha = colors?.line?.a ?? 1;
        const attachedAlpha = colors?.lineHighlight?.a ?? 1;
        const otherAlpha = highlight === null ? lineAlpha : DIMMED * lineAlpha;
        const trailTint = this.trails
            ? blendRgb(colors?.line?.rgb ?? 0x888888, this.trails.rgb, this.trails.strength)
            : 0;

        for (let index = 0; index < links.length; index++) {
            const link = links[index];
            const line = link.line;
            if (!link.rendered || !line) {
                continue;
            }

            if (this.seen[index] !== link || this.seenIn[index] !== this.generation) {
                this.workOut(index, link, line);
            }

            if (this.together[index] === 1) {
                // Mixed with the colour links are normally drawn in, so a trail
                // reads as a warmer line rather than as a stripe of neon.
                line.tint = trailTint;
            }

            if (this.mode === 'off') {
                continue;
            }

            const high = this.high[index];
            if (Number.isNaN(high)) {
                continue;
            }

            const attached = highlight !== null && (link.source === highlight || link.target === highlight);
            line.alpha = (attached ? attachedAlpha : otherAlpha) * high;

            const ramp = this.ramp[index];
            if (ramp && line.texture !== ramp) {
                this.plainTexture ??= line.texture;
                line.texture = ramp;
            }
        }
    }

    /**
     * One link's brightness, ramp and trail, from its two ends. A link with
     * neither end graded, such as one to an unresolved note, is left to the
     * renderer.
     */
    private workOut(index: number, link: GraphLink, line: NonNullable<GraphLink['line']>): void {
        this.seen[index] = link;
        this.seenIn[index] = this.generation;
        this.ramp[index] = undefined;
        this.together[index] = this.trails !== null && this.wasWorkedOnTogether(link) ? 1 : 0;

        if (this.mode === 'off') {
            this.high[index] = Number.NaN;
            return;
        }

        const source = this.strengthOf(link.source?.id);
        const target = this.strengthOf(link.target?.id);

        if (source === undefined && target === undefined) {
            this.high[index] = Number.NaN;
            return;
        }

        const low = Math.min(source ?? 1, target ?? 1);
        const high = Math.max(source ?? 0, target ?? 0);
        this.high[index] = high;

        if (this.mode === 'gradient' && high > 0) {
            this.ramp[index] = this.rampFor(line, low / high, (source ?? 1) < (target ?? 1));
        }
    }

    /** Drops everything worked out, for the next frame to start again. */
    private forget(): void {
        this.revision = undefined;
        this.nextGeneration();
    }

    /** Leaves every slot stale without touching the arrays. Zero is never a generation. */
    private nextGeneration(): void {
        this.generation = (this.generation + 1) >>> 0 || 1;
    }

    /**
     * Two linked notes saved close enough together that they were almost
     * certainly open in the same sitting. It says nothing about how long ago
     * that sitting was, which is what the fade is already for.
     */
    private wasWorkedOnTogether(link: GraphLink): boolean {
        const gap = this.trails?.gapMs;
        const source = link.source?.id === undefined ? undefined : this.mtimeOf(link.source.id);
        const target = link.target?.id === undefined ? undefined : this.mtimeOf(link.target.id);

        if (gap === undefined || source === undefined || target === undefined) {
            return false;
        }

        return Math.abs(source - target) <= gap;
    }

    destroy(): void {
        this.restoreTextures();
        this.ramps.length = 0;
        this.forget();
    }

    /** Nodes with no modification time, such as unresolved links, are skipped. */
    private strengthOf(id: string | undefined): number | undefined {
        if (id === undefined) {
            return undefined;
        }

        const opacity = this.opacityOf(id);
        return opacity === undefined ? undefined : Math.min(1, Math.max(0, opacity));
    }

    /**
     * The ramp that stretched along a link reads brightest at its newer end.
     *
     * The sprite's own x axis runs from source to target, so the ramp only has
     * to know which way round the two ends are. Quantizing the ratio keeps the
     * number of textures at sixteen however many links there are.
     */
    private rampFor(line: NonNullable<GraphLink['line']>, ratio: number, ascending: boolean): GraphTexture | undefined {
        if (!this.gradientsWork) {
            return undefined;
        }

        const step = Math.round(Math.min(1, Math.max(0, ratio)) * (RAMP_STEPS - 1));
        const index = step * 2 + (ascending ? 1 : 0);

        return this.ramps[index] ?? this.buildRamp(index, step / (RAMP_STEPS - 1), ascending, line);
    }

    private buildRamp(index: number, low: number, ascending: boolean, line: NonNullable<GraphLink['line']>): GraphTexture | undefined {
        const build = (line.texture?.constructor as GraphTextureFactory | undefined)?.from;

        try {
            const canvas = createEl('canvas');
            canvas.width = RAMP_WIDTH;
            canvas.height = 1;

            const context = canvas.getContext('2d');
            if (!build || !context) {
                this.gradientsWork = false;
                return undefined;
            }

            const ramp = context.createLinearGradient(0, 0, RAMP_WIDTH, 0);
            ramp.addColorStop(0, `rgba(255, 255, 255, ${ascending ? low : 1})`);
            ramp.addColorStop(1, `rgba(255, 255, 255, ${ascending ? 1 : low})`);

            context.fillStyle = ramp;
            context.fillRect(0, 0, RAMP_WIDTH, 1);

            const texture = build.call(line.texture?.constructor, canvas);
            this.ramps[index] = texture;

            return texture;
        } catch {
            // Obsidian bundles its own renderer, so a future version could make
            // this unreachable. Flat links are a fine thing to fall back to.
            this.gradientsWork = false;
            return undefined;
        }
    }

    /** Hands every link back the texture Obsidian drew it with. */
    private restoreTextures(): void {
        const plain = this.plainTexture;
        if (!plain) {
            return;
        }

        for (const link of this.renderer.links ?? []) {
            if (link.line && link.line.texture !== plain) {
                link.line.texture = plain;
            }
        }
    }
}
