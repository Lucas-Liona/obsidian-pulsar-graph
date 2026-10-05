import { GraphLink, GraphRenderer, GraphTexture, GraphTextureFactory } from './graph';

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
    private readonly ramps = new Map<string, GraphTexture>();
    private plainTexture: GraphTexture | undefined;
    private mode: LinkRecency = 'off';
    private trails: TrailOptions | null = null;
    private gradientsWork = true;

    constructor(
        private readonly renderer: GraphRenderer,
        private readonly opacityOf: (id: string) => number | undefined,
        private readonly mtimeOf: (id: string) => number | undefined
    ) {}

    setMode(mode: LinkRecency): void {
        if (mode !== this.mode) {
            this.mode = mode;
            this.restoreTextures();
        }
    }

    /**
     * Trails are shown by colour and age by brightness, so the two say
     * different things about the same link instead of competing for the one
     * channel. Obsidian eases a link's tint back on its own once this stops
     * writing it, so switching trails off needs nothing undone.
     */
    setTrails(trails: TrailOptions | null): void {
        this.trails = trails;
    }

    /** Runs after a frame, where the renderer has just set every link's alpha. */
    sync(): void {
        if (this.mode === 'off' && !this.trails) {
            return;
        }

        const highlight = this.renderer.getHighlightNode?.() ?? null;

        for (const link of this.renderer.links ?? []) {
            const line = link.line;
            if (!link.rendered || !line) {
                continue;
            }

            if (this.trails && this.wasWorkedOnTogether(link)) {
                line.tint = this.trails.rgb;
            }

            if (this.mode === 'off') {
                continue;
            }

            const source = this.strengthOf(link.source?.id);
            const target = this.strengthOf(link.target?.id);

            if (source === undefined && target === undefined) {
                continue;
            }

            const low = Math.min(source ?? 1, target ?? 1);
            const high = Math.max(source ?? 0, target ?? 0);

            line.alpha = this.baseAlphaFor(link, highlight) * high;

            if (this.mode === 'gradient' && high > 0) {
                this.paintRamp(line, low / high, (source ?? 1) < (target ?? 1));
            }
        }
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
        this.ramps.clear();
    }

    /**
     * What the renderer would have drawn this link at, recomputed rather than
     * read back. Its own value is eased a tenth of the way per frame, so
     * scaling that would compound into something far darker than intended.
     */
    private baseAlphaFor(link: GraphLink, highlight: unknown): number {
        const colors = this.renderer.colors;
        const attached = highlight !== null && (link.source === highlight || link.target === highlight);
        const color = attached ? colors?.lineHighlight : colors?.line;

        return (highlight !== null && !attached ? DIMMED : 1) * (color?.a ?? 1);
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
     * Stretches a ramp along the link so it reads brightest at the newer end.
     *
     * The sprite's own x axis runs from source to target, so the ramp only has
     * to know which way round the two ends are. Quantizing the ratio keeps the
     * number of textures at sixteen however many links there are.
     */
    private paintRamp(line: NonNullable<GraphLink['line']>, ratio: number, ascending: boolean): void {
        if (!this.gradientsWork) {
            return;
        }

        const step = Math.round(Math.min(1, Math.max(0, ratio)) * (RAMP_STEPS - 1));
        const key = `${step}-${ascending ? 'up' : 'down'}`;

        const ramp = this.ramps.get(key) ?? this.buildRamp(key, step / (RAMP_STEPS - 1), ascending, line);
        if (!ramp) {
            return;
        }

        if (line.texture !== ramp) {
            this.plainTexture ??= line.texture;
            line.texture = ramp;
        }
    }

    private buildRamp(key: string, low: number, ascending: boolean, line: NonNullable<GraphLink['line']>): GraphTexture | undefined {
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
            this.ramps.set(key, texture);

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
