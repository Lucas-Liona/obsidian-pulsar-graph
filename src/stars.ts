import type { Timers } from './confirm';
import { GraphCircle, GraphNode, GraphRenderer, GraphTexture } from './graph';

/**
 * Stars and black holes: a soft halo around the newest notes in the graph.
 *
 * Brightness runs out at the top. Past full alpha the renderer lightens a
 * circle channel by channel until every channel saturates, so the newest notes
 * of a vault all end up the same white, and nothing about colour can say which
 * of them is newer. A halo is drawn around the node instead of in it, so it
 * has room the colour does not.
 *
 * On a dark theme a halo is added to what is under it, and glows. On a light
 * one adding light to white changes nothing, so the halo is multiplied in
 * instead and the note sits in a pool of black. Same notes, same shape, and
 * it follows the theme when the theme changes.
 *
 * Added over what is there, not drawn behind it. Destination-over kept every
 * colour exact, and hid the glow wherever anything had been drawn first: in a
 * 20,000-note graph faint nodes and links cover the whole canvas, and the
 * stars vanished. The node's own circle is drawn again over its halo instead,
 * so the note keeps its colour while the light falls on what is around it.
 */

/** PIXI 7's numbers for the two blend modes, as Obsidian's copy has them. */
const BLEND_ADD = 1;
const BLEND_MULTIPLY = 2;

/** The halo is drawn once at this size and scaled to each node. */
const TEXTURE_SIZE = 256;

/**
 * How many circle widths across the newest note's halo is, and the last
 * one's. Halving it down the list keeps the newest obvious among the rest.
 */
const WIDEST = 6;
const NARROWEST = 3;

/** How strongly the newest note's halo is drawn, and the last one's. */
const STRONGEST = 1;
const FAINTEST = 0.4;

/**
 * How far a pulsing star's alpha swings either side of its own level, the same
 * for every star, and the least it is ever drawn at. A star's level is its
 * strength, moved into the room the swing leaves between this floor and full,
 * so the newest swings between 0.3 and 1, wider than one breath of every star
 * in step did (0.35 to 1), and the faintest of a list between 0.12 and 0.82.
 * The same swing as before on a level of 0.47 rather than 0.4 would have left
 * that faintest star moving by a few grey levels: measured on the 20,000-note
 * graph, a star other than the newest moved 11 to 22 levels out of 255 with a
 * swing of 0.22, against 45 for the newest.
 */
const SWING = 0.35;
const DIMMEST = 0.12;

/**
 * How many circle widths a halo grows by at the top of a breath, back down to
 * its own width at the bottom. Growing outward rather than either side of it:
 * the note's circle is drawn again over the middle of its halo, a third of the
 * way out on the narrowest, so a halo that shrank would spend half its breath
 * where nothing shows. The same number of widths for every star is a larger
 * share of a narrow one, which is the one that needed it.
 */
const GROW = 2;

/**
 * How long one star takes to brighten and dim, drawn once per note from a
 * normal distribution and held inside these. Out of step and at different
 * speeds, a field of them drifts in and out of phase rather than breathing as
 * one. The slowest finishes a breath inside five seconds, so every star in a
 * few seconds of looking is seen to move.
 */
const PERIOD_MEAN_MS = 3200;
const PERIOD_SD_MS = 800;
const PERIOD_SHORTEST_MS = 2000;
const PERIOD_LONGEST_MS = 5000;

/**
 * Whether the system has asked for less motion, which a pulse is. On Windows
 * that is turning off animation effects. Outside a window nothing has.
 */
export function reducedMotion(): boolean {
    return typeof activeWindow !== 'undefined' && (activeWindow.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
}

/**
 * How often a breath is drawn while the graph is otherwise still. Waking the
 * renderer's own loop draws every node at the display's rate, 161 frames a
 * second on the screen this was measured on, which held 1.3 cores busy between
 * the window and the GPU for ten halos. The quickest star, two seconds a
 * breath, moves its alpha by under 0.04 and its width by about a tenth of a
 * circle between frames at 30 a second.
 */
export const BREATH_FRAME_MS = 33;

/** How often a breath looks again while its graph cannot be seen. */
const UNSEEN_RETRY_MS = 500;

/** Past this many idle frames the renderer's loop has stopped. */
const ASLEEP_AFTER = 60;

/** The parts of PIXI's sprite this needs. */
interface HaloSprite {
    alpha: number;
    blendMode: number;
    eventMode?: string;
    parent?: unknown;
    anchor: { set: (x: number, y?: number) => void };
    position: { set: (x: number, y?: number) => void };
    scale: { set: (x: number, y?: number) => void };
    destroy: () => void;
}

type SpriteConstructor = new (texture: GraphTexture) => HaloSprite;

/** The parts of PIXI's graphics this needs, for the circle drawn again over a halo. */
interface Core {
    tint: number;
    eventMode?: string;
    parent?: unknown;
    destroy: () => void;
}

type CoreConstructor = new (geometry: unknown) => Core;

/** What a halo is built from, found on the graph rather than taken from a global. */
interface Kit {
    Sprite: SpriteConstructor;
    from: (source: HTMLCanvasElement) => GraphTexture | null;
}

interface Halo {
    sprite: HaloSprite;
    /**
     * The node's own circle drawn again over the halo. A child is always drawn
     * after its parent, so a halo added to the circle lands on top of it, and
     * light added at its middle turned the spotlight's green and a pin's
     * purple white. This puts the note's own colour back over it. A note drawn
     * below full strength is drawn twice, so it comes out a little more
     * opaque; a star is one of the newest notes, which are rarely faint.
     */
    core: Core | null;
    circle: GraphCircle;
    /**
     * How many circle widths across it is drawn now, so a change of rank or a
     * breath resizes it, and one that has stopped breathing goes back.
     */
    width: number;
    /** The circle's own width in its own units, measured once. */
    across: number;
    /** Its note's own pace, kept while the note stays a star. */
    rhythm: Rhythm;
}

/** What to draw, worked out per repaint. */
export interface StarLook {
    /** The notes to draw as stars, newest first. Empty draws none. */
    paths: readonly string[];
    /** Black holes rather than stars. */
    light: boolean;
    /** Whether the halos breathe, which keeps the graph drawing. */
    pulse: boolean;
}

/**
 * The halos on one graph.
 *
 * Each is a child of its node's circle, which is what keeps it cheap: it moves,
 * zooms, fades on hover and is culled at the edge of the viewport along with
 * the circle, without being told any of it.
 */
export class Stars {
    private readonly halos = new Map<string, Halo>();
    private paths: readonly string[] = [];
    private wanted = new Set<string>();
    private light = false;
    private pulse = false;
    private texture: GraphTexture | null = null;
    /** Undefined until looked for; null when this graph has nothing to build from. */
    private kit: Kit | null | undefined = undefined;
    /** The next breath drawn while the renderer sleeps, if one is due. */
    private breathing: number | null = null;

    constructor(
        private readonly renderer: GraphRenderer,
        private readonly paint: (light: boolean) => HTMLCanvasElement | null = paintHalo,
        private readonly timers: Timers = window
    ) {}

    set(look: StarLook): void {
        // A halo is drawn in one colour and blended one way, so a change of
        // theme rebuilds every one rather than recolouring it.
        if (look.light !== this.light) {
            this.clear();
            this.dropTexture();
            this.light = look.light;
        }

        if (look.paths !== this.paths) {
            this.paths = look.paths;
            this.wanted = new Set(look.paths);
        }

        this.pulse = look.pulse;
    }

    /**
     * Brings the halos in line with the frame just drawn, and says whether
     * they are breathing. While the renderer's own loop runs they ride it.
     * Once it has stopped, a breath goes on at its own slower rate without
     * waking it: see `breathe`. A halo that is still asks for nothing, and
     * the graph sleeps the way it would without one.
     */
    sync(now: number): boolean {
        if (this.paths.length === 0) {
            if (this.halos.size > 0) {
                this.clear();
            }

            this.stopBreathing();
            return false;
        }

        for (const [path, halo] of this.halos) {
            if (!this.wanted.has(path)) {
                detach(halo);
                this.halos.delete(path);
            }
        }

        const count = this.paths.length;

        for (let rank = 0; rank < count; rank++) {
            const path = this.paths[rank];
            const circle = this.renderer.nodeLookup[path]?.circle ?? null;
            let halo = this.halos.get(path);

            // Obsidian rebuilds every circle when it rebuilds the graph's
            // graphics, and destroying the old one takes the halo with it.
            if (halo && halo.circle !== circle) {
                detach(halo);
                this.halos.delete(path);
                halo = undefined;
            }

            if (!circle) {
                continue;
            }

            halo ??= this.create(circle, rank) ?? undefined;
            if (!halo) {
                // Nothing to build one from on this graph, and nothing will
                // appear later that would change that.
                this.stopBreathing();
                return false;
            }

            // Both worked out from the rank every frame and assigned, never
            // scaled from what was drawn last, so a breath cannot drift.
            const wave = this.pulse ? waveOf(now, halo.rhythm) : null;
            const strength = strengthAt(rank, count);
            const own = widthAt(rank, count);
            const width = wave === null ? own : swell(own, wave);
            if (halo.width !== width) {
                halo.width = width;
                halo.sprite.scale.set(width * halo.across / TEXTURE_SIZE);
            }

            halo.sprite.alpha = wave === null ? strength : shimmer(strength, wave);

            // The renderer eases the circle's tint every frame and a child
            // inherits none of it. Its alpha, position and zoom it does.
            if (halo.core && halo.core.tint !== circle.tint) {
                halo.core.tint = circle.tint;
            }
        }

        const breathing = this.pulse && this.halos.size > 0;
        if (!breathing) {
            this.stopBreathing();
        } else if (this.breathing === null && this.asleep()) {
            this.breathing = this.timers.setTimeout(() => this.breathe(), BREATH_FRAME_MS);
        }

        return breathing;
    }

    clear(): void {
        for (const halo of this.halos.values()) {
            detach(halo);
        }

        this.halos.clear();
    }

    destroy(): void {
        this.stopBreathing();
        this.clear();
        this.dropTexture();
        this.paths = [];
        this.wanted = new Set();
    }

    /** How many halos are on the graph now. */
    get drawn(): number {
        return this.halos.size;
    }

    /**
     * One breath drawn while the renderer is asleep: the halos moved on, and
     * the stage drawn once as it stands. Nothing else in a sleeping graph has
     * moved, so none of the per-node work a frame of its own would do is
     * needed. Stops as soon as the renderer wakes for anything, whose frames
     * then carry the breath, and is picked up again by `sync` once it sleeps.
     */
    private breathe(): void {
        this.breathing = null;

        if (!this.pulse || this.halos.size === 0 || !this.asleep()) {
            return;
        }

        const view = this.renderer.containerEl;
        // A hidden tab has a renderer of no width, and a minimized window
        // draws nothing it is handed. Check back rather than draw.
        if (!this.renderer.px?.render || (view && (view.clientWidth === 0 || view.ownerDocument.hidden))) {
            this.breathing = this.timers.setTimeout(() => this.breathe(), UNSEEN_RETRY_MS);
            return;
        }

        // Which also queues the next one.
        if (this.sync(performance.now())) {
            this.renderer.px.render();
        }
    }

    private asleep(): boolean {
        return (this.renderer.idleFrames ?? 0) > ASLEEP_AFTER;
    }

    private stopBreathing(): void {
        if (this.breathing !== null) {
            this.timers.clearTimeout(this.breathing);
            this.breathing = null;
        }
    }

    private create(circle: GraphCircle, rank: number): Halo | null {
        const kit = this.findKit();
        const texture = kit ? this.textureFrom(kit) : null;

        if (!kit || !texture || !circle.addChild) {
            return null;
        }

        // Measured before the halo is added, which would widen it.
        const bounds = circle.getLocalBounds?.();
        const across = bounds && bounds.width > 0 ? bounds.width : 200;
        const sprite = new kit.Sprite(texture);
        const width = widthAt(rank, this.paths.length);

        sprite.anchor.set(0.5);
        sprite.position.set(bounds ? bounds.x + bounds.width / 2 : 100, bounds ? bounds.y + bounds.height / 2 : 100);
        sprite.scale.set(width * across / TEXTURE_SIZE);
        sprite.blendMode = this.light ? BLEND_MULTIPLY : BLEND_ADD;
        // A circle is hit-tested by PIXI, children and all, so a halo left
        // to the default would make six times the area hover the note.
        sprite.eventMode = 'none';
        sprite.alpha = 0;

        circle.addChild(sprite);

        // Built over the circle's own shape, so it is exactly the circle and
        // shares what it is drawn from rather than copying it.
        const Graphics = (circle as { constructor?: unknown }).constructor as CoreConstructor | undefined;
        let core: Core | null = null;
        if (typeof Graphics === 'function' && circle.geometry) {
            core = new Graphics(circle.geometry);
            core.eventMode = 'none';
            core.tint = circle.tint;
            circle.addChild(core);
        }

        const halo: Halo = { sprite, core, circle, width, across, rhythm: rhythmOf(this.paths[rank]) };
        this.halos.set(this.paths[rank], halo);

        return halo;
    }

    /**
     * Obsidian bundles its own PIXI and exposes none of it. A title is a PIXI
     * text, which is a sprite drawn from a texture, so its class's parent is the
     * sprite class and its texture's class builds textures. Every node has a
     * title, which a link's line, the other sprite in the graph, cannot promise.
     */
    private findKit(): Kit | null {
        if (this.kit !== undefined) {
            return this.kit;
        }

        let title: GraphNode['text'] = null;
        for (const node of this.renderer.nodes ?? Object.values(this.renderer.nodeLookup)) {
            if (node.text) {
                title = node.text;
                break;
            }
        }

        // Nothing to look at yet, which is not the same as nothing to find.
        if (!title) {
            return null;
        }

        const Sprite = Object.getPrototypeOf(title.constructor) as SpriteConstructor | null;
        const Texture = title.texture?.constructor as { from?: Kit['from'] } | undefined;

        this.kit = typeof Sprite === 'function' && typeof Texture?.from === 'function'
            ? { Sprite, from: (source) => Texture.from?.(source) ?? null }
            : null;

        return this.kit;
    }

    private textureFrom(kit: Kit): GraphTexture | null {
        if (this.texture) {
            return this.texture;
        }

        const canvas = this.paint(this.light);
        this.texture = canvas ? kit.from(canvas) : null;

        return this.texture;
    }

    private dropTexture(): void {
        this.texture?.destroy?.(true);
        this.texture = null;
    }
}

/** How many circle widths across a halo is, by its place in the list. */
export function widthAt(rank: number, count: number): number {
    return count <= 1 ? WIDEST : WIDEST - ((WIDEST - NARROWEST) * rank) / (count - 1);
}

/** How strongly a halo is drawn, by its place in the list. */
export function strengthAt(rank: number, count: number): number {
    return count <= 1 ? STRONGEST : STRONGEST - ((STRONGEST - FAINTEST) * rank) / (count - 1);
}

/** A star's pace: how long one breath takes, and where in it the star starts. */
export interface Rhythm {
    period: number;
    phase: number;
}

/**
 * A note's own pace, drawn from its path rather than from its place in the
 * list, so a star keeps its rhythm across a reload and when a newer note
 * pushes it down the list.
 */
export function rhythmOf(path: string): Rhythm {
    const [first, second, third] = uniforms(path, 3);
    // Box-Muller: two uniform draws make one from a standard normal.
    const normal = Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
    const period = Math.min(PERIOD_LONGEST_MS, Math.max(PERIOD_SHORTEST_MS, PERIOD_MEAN_MS + PERIOD_SD_MS * normal));

    return { period, phase: 2 * Math.PI * third };
}

/** Where a star is in its own breath at a moment, from -1 at the bottom to 1 at the top. */
export function waveOf(now: number, rhythm: Rhythm): number {
    return Math.sin((2 * Math.PI * now) / rhythm.period + rhythm.phase);
}

/**
 * How strongly a breathing halo is drawn at a point in its breath: its level
 * plus the swing. Never above full and never out: a star that went dark
 * between breaths would read as one that had stopped being new.
 */
export function shimmer(strength: number, wave: number): number {
    const share = (strength - FAINTEST) / (STRONGEST - FAINTEST);
    const level = DIMMEST + SWING + (1 - DIMMEST - 2 * SWING) * share;

    return Math.min(1, Math.max(DIMMEST, level + SWING * wave));
}

/** How many circle widths across a breathing halo is at a point in its breath. */
export function swell(width: number, wave: number): number {
    return width + GROW * (0.5 + 0.5 * wave);
}

/**
 * Numbers strictly between 0 and 1 that depend on nothing but the text: a
 * 32-bit FNV-1a hash of it, stepped with mulberry32.
 */
function uniforms(text: string, count: number): number[] {
    let state = 2166136261;
    for (let i = 0; i < text.length; i++) {
        state = Math.imul(state ^ text.charCodeAt(i), 16777619);
    }

    const out: number[] = [];
    for (let i = 0; i < count; i++) {
        state = (state + 0x6d2b79f5) | 0;
        let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
        mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
        out.push((((mixed ^ (mixed >>> 14)) >>> 0) + 0.5) / 4294967296);
    }

    return out;
}

/**
 * A soft round falloff, white for a star and black for a black hole. Steep at
 * the middle and long at the edge, so it reads as light around a point rather
 * than as a bigger disc.
 */
function paintHalo(light: boolean): HTMLCanvasElement | null {
    const canvas = createEl('canvas');
    canvas.width = canvas.height = TEXTURE_SIZE;

    const context = canvas.getContext('2d');
    if (!context) {
        return null;
    }

    const middle = TEXTURE_SIZE / 2;
    const rgb = light ? '0, 0, 0' : '255, 255, 255';
    const gradient = context.createRadialGradient(middle, middle, 0, middle, middle, middle);

    gradient.addColorStop(0, `rgba(${rgb}, 0.9)`);
    gradient.addColorStop(0.12, `rgba(${rgb}, 0.55)`);
    gradient.addColorStop(0.35, `rgba(${rgb}, 0.16)`);
    gradient.addColorStop(1, `rgba(${rgb}, 0)`);

    context.fillStyle = gradient;
    context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

    return canvas;
}

/** From whatever it is drawn in, which after a rebuild may be nothing. */
function detach(halo: Halo): void {
    for (const each of [halo.sprite, halo.core]) {
        if (!each) {
            continue;
        }

        (each.parent as GraphCircle | null | undefined)?.removeChild?.(each);
        // A graphics object built over another's shape lets go of it here and
        // leaves it to the circle that still draws it.
        each.destroy();
    }
}
