import { setIcon } from 'obsidian';
import { drawHistory } from './bead-view';
import { formatAge } from './age';
import { formatDuration } from './duration';
import { blendRgb, deepenRgb, LinkedGraph, legibleOnLight, poolNeighbours, sizeScale, warmByGroup } from './graph';
import { Bead, sameSitting } from './history';
import { INK_SHADES, inkColoursFor, shadeMs } from './ink';
import { makeLinkDot } from './link-dots';
import { NoteFile, OpacityStore } from './opacity-store';
import type { PulsarGraphSettings } from './settings';
import { paintHalo, rhythmOf, shimmer, strengthAt, swell, waveOf, widthAt } from './stars';
import { fadeStrength, TAB_MARKS } from './tabs';

/**
 * A picture at the top of each part of the settings, of what that part's
 * settings change, redrawn as they move.
 *
 * Every number in them comes from the plugin's own code: brightness from the
 * store measuring this vault, sizes from the graph's sizing, the glow and group
 * temperature from the same pooling the graph runs, the replay and the local
 * graph from a store of their own, the tab bar, the link dots, fresh writing
 * and the history rail from the same classes and functions that draw the real
 * ones. What is invented is only the example: a handful of notes, given ages
 * from this vault's own spread and names that belong to nobody.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const YEAR = 365 * DAY;

/** What the pictures read from the plugin: ages and the curve, never a note's name or text. */
export interface PictureSource {
    settings: () => PulsarGraphSettings;
    /** Every note's modification time, oldest first. */
    times: () => readonly number[];
    /**
     * What each of those notes is drawn at in the graph, in the same order:
     * the curve, and the edit intensity blended in when that is on.
     */
    drawn: () => readonly number[];
    /** What a note modified at this moment is drawn at, against the vault as it is measured now. */
    opacityAt: (mtime: number) => number;
    /** When the notes the spotlight covers now were modified. */
    spotlitTimes: () => ReadonlySet<number>;
    lightTheme: () => boolean;
}

export type PictureKind =
    | 'curve'
    | 'stars'
    | 'size'
    | 'links'
    | 'sittings'
    | 'clusters'
    | 'local'
    | 'replay'
    | 'highlights'
    | 'note'
    | 'tabs'
    | 'history';

/** The theme's colours, packed, read once per redraw. */
interface Palette {
    light: boolean;
    background: number;
    node: number;
    line: number;
    text: number;
    muted: number;
    faint: number;
    accent: number;
    font: string;
}

/** Everything a picture draws from, the same for every picture in one redraw. */
interface Scene {
    settings: PulsarGraphSettings;
    source: PictureSource;
    palette: Palette;
    times: readonly number[];
    drawn: readonly number[];
    now: number;
}

/** A part of a caption; the strong ones are the figures worth finding at a glance. */
type Words = (string | { strong: string })[];

/** The fastest anything moving in a picture is redrawn: 30 a second, as a breathing star in the graph is. */
const MOVING_FRAME_MS = 33;

interface Picture {
    /**
     * Draws it again. The width is the picture's own, measured with every
     * other picture's before any of them changes the page, so a redraw lays
     * the page out once rather than once a picture.
     */
    draw: (scene: Scene, width: number) => void;
    /** True while it has something moving, so the frame loop keeps it going. */
    moving: (scene: Scene) => boolean;
    destroy?: () => void;
}

/**
 * The pictures on one build of the settings tab.
 *
 * Drawing is asked for, never done on the spot: every request inside one frame
 * becomes one redraw, on the settings window's own animation frame. That frame
 * never comes while the window is hidden or minimised, so a closed or covered
 * tab draws nothing, and `destroy` stops whatever is left when the tab is
 * rebuilt or closed.
 *
 * A change redraws every picture. Something moving — a star breathing, writing
 * cooling, the replay playing — redraws only itself, no more than 30 times a
 * second, and only while it is scrolled into view.
 *
 * A redraw reads nothing that makes the page lay itself out: each picture's
 * width is the one its resize observer last reported, and the theme's colours
 * are read once and again only when the theme changes. Asking for either in
 * the middle of a redraw had the whole app laid out twice a frame, which cost
 * more than every picture put together.
 */
export class Pictures {
    private readonly pictures: { picture: Picture; holder: HTMLElement }[] = [];
    private readonly widths = new WeakMap<Element, number>();
    private readonly shown = new WeakSet<Element>();
    private readonly observer: ResizeObserver;
    private readonly scrolled: IntersectionObserver;
    private palette: Palette | null = null;
    private frame: number | null = null;
    private waiting: number | null = null;
    private everything = false;
    private destroyed = false;
    /** How long the last redraw of every picture took, for measuring. */
    lastDrawMs = 0;

    constructor(private readonly source: PictureSource, private readonly root: HTMLElement) {
        // The settings window's own observers: one made in another window is
        // never told about this one's layout, and reported nothing at all.
        const view = root.win as Window & { ResizeObserver: typeof ResizeObserver; IntersectionObserver: typeof IntersectionObserver };

        this.observer = new view.ResizeObserver((entries) => {
            let moved = false;

            for (const entry of entries) {
                const width = Math.round(entry.contentRect.width);

                if (this.widths.get(entry.target) !== width) {
                    this.widths.set(entry.target, width);
                    moved = true;
                }
            }

            if (moved) {
                this.request();
            }
        });

        // Which pictures are scrolled into view, told rather than asked, for
        // the same reason.
        this.scrolled = new view.IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    this.shown.add(entry.target);
                } else {
                    this.shown.delete(entry.target);
                }
            }
        }, { root });
    }

    /** The theme changed: its colours are read again on the next redraw. */
    restyle(): void {
        this.palette = null;
        this.request();
    }

    add(parent: HTMLElement, kind: PictureKind): void {
        if (this.destroyed) {
            return;
        }

        const holder = parent.createDiv({ cls: `pulsar-graph-picture pulsar-graph-picture-${kind}` });
        this.pictures.push({ picture: MAKERS[kind](holder, () => this.request()), holder });
        this.observer.observe(holder);
        this.scrolled.observe(holder);
        this.request();
    }

    /** Asks for every picture to be drawn again, once, on the next frame. */
    request(): void {
        this.everything = true;
        this.schedule();
    }

    drawAll(): void {
        this.draw(true);
    }

    destroy(): void {
        this.destroyed = true;
        this.observer.disconnect();
        this.scrolled.disconnect();

        if (this.frame !== null) {
            this.root.win.cancelAnimationFrame(this.frame);
            this.frame = null;
        }

        if (this.waiting !== null) {
            this.root.win.clearTimeout(this.waiting);
            this.waiting = null;
        }

        for (const { picture } of this.pictures) {
            picture.destroy?.();
        }

        this.pictures.length = 0;
    }

    /**
     * The next frame, for a change; for something moving, the first frame
     * after a thirtieth of a second, so a breathing star wakes the window 30
     * times a second rather than at the display's own rate.
     */
    private schedule(): void {
        if (this.destroyed || this.frame !== null || this.waiting !== null) {
            if (this.everything && this.waiting !== null) {
                this.root.win.clearTimeout(this.waiting);
                this.waiting = null;
                this.schedule();
            }

            return;
        }

        const frame = (): void => {
            this.frame = this.root.win.requestAnimationFrame(() => {
                this.frame = null;
                this.draw(this.everything);
            });
        };

        if (this.everything) {
            frame();
            return;
        }

        this.waiting = this.root.win.setTimeout(() => {
            this.waiting = null;
            frame();
        }, MOVING_FRAME_MS);
    }

    private draw(everything: boolean): void {
        if (this.destroyed || !this.root.isConnected) {
            return;
        }

        const started = performance.now();
        const scene = this.scene();
        this.everything = false;

        for (const { picture, holder } of this.pictures) {
            if (everything || (picture.moving(scene) && this.shown.has(holder))) {
                picture.draw(scene, this.widths.get(holder) ?? 0);
            }
        }

        if (everything) {
            this.lastDrawMs = performance.now() - started;
        }

        if (this.pictures.some(({ picture }) => picture.moving(scene))) {
            this.schedule();
        }
    }

    private currentPalette(): Palette {
        const light = this.source.lightTheme();

        if (this.palette?.light !== light) {
            this.palette = readPalette(this.root, light);
        }

        return this.palette;
    }

    private scene(): Scene {
        return {
            settings: this.source.settings(),
            source: this.source,
            palette: this.currentPalette(),
            times: this.source.times(),
            drawn: this.source.drawn(),
            now: Date.now()
        };
    }
}

const MAKERS: Record<PictureKind, (holder: HTMLElement, request: () => void) => Picture> = {
    curve: (holder) => canvasPicture(holder, 220, drawCurve),
    stars: (holder) => canvasPicture(holder, 104, drawStars, (scene) => scene.settings.stars && scene.settings.starPulse),
    size: (holder) => canvasPicture(holder, 150, drawSize),
    links: (holder) => canvasPicture(holder, 176, drawLinks),
    sittings: (holder) => canvasPicture(holder, 86, drawSittings),
    clusters: (holder) => canvasPicture(holder, 196, drawClusters),
    local: (holder) => canvasPicture(holder, 200, drawLocal),
    replay: replayPicture,
    highlights: (holder) => canvasPicture(holder, 136, drawHighlights),
    note: notePicture,
    tabs: tabsPicture,
    history: historyPicture
};

// ---------------------------------------------------------------- canvas pictures

/** Where something hoverable was drawn, and what it says when it is. */
interface Hit {
    x: number;
    y: number;
    r: number;
}

/** What a canvas picture draws with. */
interface Canvas {
    context: CanvasRenderingContext2D;
    width: number;
    height: number;
    hovered: number;
    hits: Hit[];
}

type CanvasDraw = (canvas: Canvas, scene: Scene) => Words;

/**
 * A canvas the width of the settings tab, and a caption under it.
 *
 * Drawn at the screen's pixel ratio, so lines and text are as sharp as the rest
 * of the page. A point the picture marks as hoverable redraws it when the
 * pointer comes near, which is how an age appears over a node on hover the way
 * the graph shows one.
 */
function canvasPicture(holder: HTMLElement, height: number, paint: CanvasDraw, moving?: (scene: Scene) => boolean): Picture {
    const frame = holder.createDiv({ cls: 'pulsar-graph-picture-frame' });
    const canvas = frame.createEl('canvas');
    const caption = holder.createDiv({ cls: 'pulsar-graph-picture-caption' });
    const state = { hovered: -1, hits: [] as Hit[], last: null as Scene | null };

    // Set once, here, rather than on every draw: a style written between two
    // pictures' drawing has the next one's text wait on a restyle of the page.
    canvas.setCssStyles({ height: `${height}px` });

    // Drawn on a canvas that is not on the page, then copied onto the one that
    // is. A canvas on the page has its whole document restyled before it can
    // set a font, so the first line of text after anything changed on the page
    // waited on that: about 5 ms a picture. One off the page has nothing to wait for.
    const work = createEl('canvas');

    const draw = (scene: Scene, outer: number): void => {
        state.last = scene;
        // Inside the frame's border.
        const width = outer - 2;
        const context = work.getContext('2d');
        const shown = canvas.getContext('2d');

        if (width <= 0 || !context || !shown) {
            return;
        }

        const ratio = canvas.win.devicePixelRatio || 1;
        const across = Math.round(width * ratio);
        const down = Math.round(height * ratio);

        // Resizing a canvas throws its bitmap away; only done when the size moved.
        if (canvas.width !== across || canvas.height !== down) {
            canvas.width = work.width = across;
            canvas.height = work.height = down;
        }

        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.fillStyle = hex(scene.palette.background);
        context.fillRect(0, 0, width, height);

        const surface: Canvas = { context, width, height, hovered: state.hovered, hits: [] };
        const words = paint(surface, scene);
        state.hits = surface.hits;
        shown.drawImage(work, 0, 0);
        writeCaption(caption, words);
    };

    canvas.addEventListener('pointermove', (event) => {
        const box = canvas.getBoundingClientRect();
        const x = event.clientX - box.left;
        const y = event.clientY - box.top;
        let found = -1;
        let nearest = Infinity;

        state.hits.forEach((hit, index) => {
            const distance = Math.hypot(hit.x - x, hit.y - y);

            if (distance <= hit.r + 6 && distance < nearest) {
                nearest = distance;
                found = index;
            }
        });

        if (found !== state.hovered) {
            state.hovered = found;

            if (state.last) {
                draw(state.last, holder.clientWidth);
            }
        }
    });

    canvas.addEventListener('pointerleave', () => {
        if (state.hovered !== -1 && state.last) {
            state.hovered = -1;
            draw(state.last, holder.clientWidth);
        }
    });

    return { draw, moving: (scene) => moving?.(scene) ?? false };
}

/** What each caption and each drawn-in-the-page picture last showed, so one that would show the same is left alone. */
const written = new WeakMap<HTMLElement, string>();

/**
 * True when an element would be given exactly what it already shows. A
 * picture made of the page's own elements rebuilt with nothing changed still
 * has the page restyled and laid out again before the next frame.
 */
function unchanged(element: HTMLElement, key: string): boolean {
    if (written.get(element) === key) {
        return true;
    }

    written.set(element, key);
    return false;
}

/**
 * Writes a caption once every picture in a redraw has been drawn, and only if
 * it changed. A caption written between two pictures leaves the page needing
 * a restyle, and the next picture's first line of text waits for it: twelve
 * pictures paid that twelve times, about 5 ms each.
 */
function writeCaption(caption: HTMLElement, words: Words): void {
    if (unchanged(caption, JSON.stringify(words))) {
        return;
    }

    queueMicrotask(() => {
        caption.empty();

        for (const word of words) {
            if (typeof word === 'string') {
                caption.appendText(word);
            } else {
                caption.createEl('strong', { text: word.strong });
            }
        }
    });
}

// ---------------------------------------------------------------- Time: the curve

const CURVE_DOTS = 400;
const CURVE_MEASURED = 1000;

/**
 * Brightness against age, on a log axis of age, with this vault's own notes on
 * the line at the brightness each is drawn at. Above full strength the colour
 * changes rather than the opacity, which the shaded band says.
 */
function drawCurve(canvas: Canvas, scene: Scene): Words {
    const { context, width, height } = canvas;
    const { palette, settings, times, now, source } = scene;

    if (times.length === 0) {
        label(context, palette, 'No notes to measure yet', 14, 28, palette.muted, 12, 'left');
        return [];
    }

    const left = 40;
    const right = 14;
    const top = 14;
    const bottom = 26;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;

    const youngest = Math.max(MINUTE, now - times[times.length - 1]);
    const oldest = Math.max(now - times[0], youngest * 4, 2 * DAY);
    const from = Math.max(MINUTE, youngest / 3);
    const to = oldest * 1.15;
    const x = (age: number): number => left + ((Math.log(clamp(age, from, to)) - Math.log(from)) / (Math.log(to) - Math.log(from))) * plotWidth;
    const highest = Math.max(1.25, Math.min(settings.maxOpacity, 12) * 1.08);
    const y = (value: number): number => top + (1 - clamp(value, 0, highest) / highest) * plotHeight;

    // Past full strength the colour itself moves, not the opacity.
    context.fillStyle = rgba(palette.accent, 0.07);
    context.fillRect(left, top, plotWidth, y(1) - top);
    context.strokeStyle = rgba(palette.faint, 0.9);
    context.setLineDash([4, 4]);
    line(context, left, y(1), left + plotWidth, y(1));
    context.setLineDash([]);
    label(context, palette, palette.light ? 'past 1, deeper toward black' : 'past 1, lighter toward white', left + plotWidth - 4, y(1) - 6, palette.muted, 10.5, 'right');

    const step = highest > 6 ? 2 : highest > 3 ? 1 : 0.5;

    for (let value = 0; value <= highest + 1e-9; value += step) {
        context.strokeStyle = rgba(palette.faint, 0.22);
        line(context, left, y(value), left + plotWidth, y(value));
        label(context, palette, value % 1 === 0 ? String(value) : value.toFixed(1), left - 6, y(value) + 4, palette.faint, 10.5, 'right');
    }

    for (const [age, name] of AGE_TICKS) {
        if (age < from || age > to) {
            continue;
        }

        context.strokeStyle = rgba(palette.faint, 0.22);
        line(context, x(age), top, x(age), top + plotHeight);
        label(context, palette, name, x(age), top + plotHeight + 15, palette.faint, 10.5, 'center');
    }

    // The curve, through the store's own sum, at ages between the notes too.
    context.strokeStyle = rgba(palette.muted, 0.75);
    context.lineWidth = 1.5;
    context.beginPath();

    for (let index = 0; index <= 160; index++) {
        const age = Math.exp(Math.log(from) + (index / 160) * (Math.log(to) - Math.log(from)));
        const value = source.opacityAt(now - age);

        if (index === 0) {
            context.moveTo(x(age), y(value));
        } else {
            context.lineTo(x(age), y(value));
        }
    }

    context.stroke();
    context.lineWidth = 1;

    // The notes themselves, at what the graph draws each at. With the edit
    // intensity blended in, a note returned to often sits above the line.
    const dots = spacedPlaces(times.length, CURVE_DOTS);

    for (const place of dots) {
        const value = scene.drawn[place];
        const at = { x: x(now - times[place]), y: y(value) };
        circle(context, at.x, at.y, 3, drawnRgb(palette.node, value, palette));
        canvas.hits.push({ x: at.x, y: at.y, r: 3 });
    }

    if (canvas.hovered >= 0 && canvas.hovered < dots.length) {
        const place = dots[canvas.hovered];
        const hit = canvas.hits[canvas.hovered];
        label(context, palette, `${formatAge(times[place], now)} · ${scene.drawn[place].toFixed(2)}`, hit.x, hit.y - 9, palette.text, 11, 'center');
    }

    // How much of the range the eye actually gets: how many notes end up at
    // the same full white, or black, at the top, and how far apart the rest are.
    const seen = spacedPlaces(times.length, CURVE_MEASURED).map((place) => seenStrength(drawnRgb(palette.node, scene.drawn[place], palette), palette)).sort((a, b) => a - b);
    const full = seen.filter((value) => value >= 0.98).length / seen.length;
    const at = (fraction: number): string => seen[Math.min(seen.length - 1, Math.floor(fraction * seen.length))].toFixed(2);

    const words: Words = [
        { strong: `${Math.round(full * 100)}%` },
        ` of your ${times.length.toLocaleString()} notes are drawn at full ${palette.light ? 'black' : 'white'}; the middle 80% run from `,
        { strong: at(0.1) },
        ' to ',
        { strong: at(0.9) },
        ' of full. Hover a dot for its age.'
    ];

    if (settings.intensityBlend > 0 && settings.history) {
        words.push(' With edit intensity blended in, a note sits above the line the more you return to it, and below it the less.');
    }

    if (settings.normalizeBy === 'shown' && settings.ageScale !== 'halflife') {
        words.push(' Measured against the whole vault here; each graph spreads it over what it shows.');
    }

    return words;
}

const AGE_TICKS: readonly [number, string][] = [
    [HOUR, '1 h'],
    [DAY, '1 d'],
    [7 * DAY, '1 w'],
    [30 * DAY, '1 mo'],
    [YEAR, '1 y'],
    [2 * YEAR, '2 y'],
    [5 * YEAR, '5 y'],
    [10 * YEAR, '10 y']
];

// ---------------------------------------------------------------- The graph: stars

/**
 * The five newest notes, with the halo each would get: widest and strongest on
 * the newest, white light on a dark theme and black on a light one, drawn
 * under the node the way the graph draws it. With Pulse on, each breathes at
 * its own pace.
 */
function drawStars(canvas: Canvas, scene: Scene): Words {
    const { context, width, height } = canvas;
    const { palette, settings, times, now, source } = scene;
    const newest = times.slice(-5).reverse();

    if (newest.length === 0) {
        return [];
    }

    const halo = paintHalo(palette.light);
    const y = height / 2 - 4;

    newest.forEach((mtime, rank) => {
        const value = source.opacityAt(mtime);
        const x = (width * (rank + 0.5)) / newest.length;
        const radius = 7 * nodeScale(value, settings);

        if (settings.stars && halo && rank < settings.starCount) {
            const strength = strengthAt(rank, settings.starCount);
            const wave = settings.starPulse ? waveOf(now, rhythmOf(`example-${rank}`)) : null;
            const across = (wave === null ? widthAt(rank, settings.starCount) : swell(widthAt(rank, settings.starCount), wave)) * radius * 2;

            context.save();
            context.globalAlpha = wave === null ? strength : shimmer(strength, wave);
            context.globalCompositeOperation = palette.light ? 'multiply' : 'lighter';
            context.drawImage(halo, x - across / 2, y - across / 2, across, across);
            context.restore();
        }

        circle(context, x, y, radius, drawnRgb(palette.node, value, palette));
    });

    // After every halo, so a wide one never covers its neighbour's age.
    newest.forEach((mtime, rank) => {
        label(context, palette, formatAge(mtime, now), (width * (rank + 0.5)) / newest.length, height - 10, palette.faint, 10.5, 'center');
    });

    if (!settings.stars) {
        return ['Your five newest notes, as they are drawn now. Switch stars on to see their halos.'];
    }

    return [
        `Your five newest notes${settings.starCount < 5 ? `, the newest ${settings.starCount} with a halo` : ''}. `,
        settings.starPulse ? 'Each breathes at its own pace.' : 'Pulse is off, so they hold still.'
    ];
}

// ---------------------------------------------------------------- The graph: size and labels

const FIVE_NAMES = ['Draft', 'Meeting notes', 'Reading list', 'Project brief', 'Old ideas'];

/** Five of this vault's notes, newest first, at the size and brightness each is drawn. */
function drawSize(canvas: Canvas, scene: Scene): Words {
    const { context, width, height } = canvas;
    const { palette, settings, times, now, source } = scene;
    const five = spaced(times, 5).reverse();

    five.forEach((mtime, index) => {
        const value = source.opacityAt(mtime);
        const radius = 7 * nodeScale(value, settings);
        const x = (width * (index + 0.5)) / five.length;
        const y = 62;
        const title = 12 * settings.titleScale;

        circle(context, x, y, radius, drawnRgb(palette.node, value, palette));
        label(context, palette, FIVE_NAMES[index], x, y + radius + 6 + title, palette.text, title, 'center');
        canvas.hits.push({ x, y, r: radius });

        const shown = settings.ageLabels === 'titles' || (settings.ageLabels === 'hover' && canvas.hovered === index);

        if (shown) {
            label(context, palette, formatAge(mtime, now), x, y - radius - 7, palette.muted, 11, 'center');
        }

        // Only for reading the picture: which age each size belongs to.
        label(context, palette, formatAge(mtime, now), x, height - 10, palette.faint, 10.5, 'center');
    });

    const sizes = settings.nodeSizeByAge
        ? `Sized from ${settings.nodeSizeSmallest}× for the oldest to ${settings.nodeSizeLargest}× for the newest. `
        : "Every node at Obsidian's own size. ";
    const ages = settings.ageLabels === 'hover'
        ? 'Hover a node for its age, as in the graph.'
        : settings.ageLabels === 'titles' ? 'Each age is written above its node.' : 'Ages are never drawn.';

    return [sizes, ages];
}

// ---------------------------------------------------------------- The graph: links

/**
 * Three notes: the newest, one saved in the same sitting, and one from days
 * before. The first link is traced when trails are on; both are aged by their
 * ends. Below, what trail strength does to a link's colour.
 */
function drawLinks(canvas: Canvas, scene: Scene): Words {
    const { context, width } = canvas;
    const { palette, settings, times, now, source } = scene;

    if (times.length === 0) {
        return [];
    }

    const gap = settings.sessionGapMinutes * MINUTE;
    const newest = times[times.length - 1];
    const sameSittingAt = newest - Math.round(gap / 2);
    const middle = spaced(times, 3)[1] ?? newest;
    const apart = newest - middle > gap ? middle : newest - 3 * DAY;
    const notes = [
        { name: 'Meeting notes', mtime: newest },
        { name: 'Project brief', mtime: sameSittingAt },
        { name: 'Reading list', mtime: apart }
    ];

    const values = notes.map((note) => source.opacityAt(note.mtime));
    const xs = [width * 0.14, width * 0.5, width * 0.86];
    const y = 46;
    const radii = values.map((value) => 9 * nodeScale(value, settings));
    const trail = parseColour(settings.trailColor);
    const traced = settings.sessionTrails;

    drawLink(context, palette, settings, xs[0] + radii[0], xs[1] - radii[1], y, traced ? blendRgb(palette.line, trail, settings.trailStrength) : palette.line, values[0], values[1]);
    drawLink(context, palette, settings, xs[1] + radii[1], xs[2] - radii[2], y, palette.line, values[1], values[2]);

    label(context, palette, traced ? `traced · ${formatDuration(Math.round(gap / 2000))} apart` : `${formatDuration(Math.round(gap / 2000))} apart`, (xs[0] + xs[1]) / 2, y - 12, traced ? blendRgb(palette.background, trail, 1) : palette.faint, 10.5, 'center');
    label(context, palette, 'days apart', (xs[1] + xs[2]) / 2, y - 12, palette.faint, 10.5, 'center');

    notes.forEach((note, index) => {
        circle(context, xs[index], y, radii[index], drawnRgb(palette.node, values[index], palette));
        label(context, palette, note.name, xs[index], y + radii[index] + 16, palette.text, 12, 'center');
        label(context, palette, formatAge(note.mtime, now), xs[index], y + radii[index] + 30, palette.faint, 10.5, 'center');
    });

    // Trail strength, from a plain link at 0 to the trail colour at 1.
    const rampY = 142;
    const rampFrom = Math.max(110, width * 0.24);
    const rampTo = width - 30;
    label(context, palette, 'Trail strength', 14, rampY + 4, palette.muted, 11.5, 'left');

    for (let index = 0; index < 64; index++) {
        const share = index / 64;
        const colour = blendRgb(palette.line, trail, share);
        context.strokeStyle = rgba(blendRgb(palette.background, colour, traced ? 1 : 0.35), 1);
        context.lineWidth = 6;
        line(context, rampFrom + share * (rampTo - rampFrom), rampY, rampFrom + ((index + 1) / 64) * (rampTo - rampFrom) + 0.5, rampY);
    }

    context.lineWidth = 1;
    label(context, palette, 'plain', rampFrom, rampY + 20, palette.faint, 10.5, 'left');
    label(context, palette, 'trail colour', rampTo, rampY + 20, palette.faint, 10.5, 'right');

    if (traced) {
        const at = rampFrom + settings.trailStrength * (rampTo - rampFrom);
        context.fillStyle = hex(palette.text);
        context.beginPath();
        context.moveTo(at, rampY - 6);
        context.lineTo(at - 5, rampY - 14);
        context.lineTo(at + 5, rampY - 14);
        context.closePath();
        context.fill();
    }

    const aged = settings.linkRecency === 'off'
        ? 'Links are one flat colour. '
        : settings.linkRecency === 'uniform' ? "Each link takes its newer end's brightness. " : 'Each link fades along its length, from the newer note to the older. ';
    const trailWords = traced
        ? `The first two were saved inside one sitting, so their link is traced at ${settings.trailStrength}.`
        : 'Tracing is off, so the first link is as plain as the second.';

    return [aged, trailWords];
}

/** One link, aged by its ends as `Age the links too` says, over the picture's background. */
function drawLink(
    context: CanvasRenderingContext2D,
    palette: Palette,
    settings: PulsarGraphSettings,
    from: number,
    to: number,
    y: number,
    colour: number,
    newer: number,
    older: number
): void {
    const ends = [clamp(newer, 0, 1), clamp(older, 0, 1)];
    const alphas = settings.linkRecency === 'gradient' ? ends : settings.linkRecency === 'uniform' ? [Math.max(...ends), Math.max(...ends)] : [1, 1];
    const gradient = context.createLinearGradient(from, 0, to, 0);
    gradient.addColorStop(0, hex(blendRgb(palette.background, colour, alphas[0])));
    gradient.addColorStop(1, hex(blendRgb(palette.background, colour, alphas[1])));
    context.strokeStyle = gradient;
    context.lineWidth = 4;
    context.lineCap = 'round';
    line(context, from, y, to, y);
    context.lineWidth = 1;
    context.lineCap = 'butt';
}

// ---------------------------------------------------------------- Sittings

/**
 * Five saves on a timeline, folded into sittings by the history's own rule:
 * a save no further from the last than *Counts as one sitting* carries the
 * sitting on.
 */
function drawSittings(canvas: Canvas, scene: Scene): Words {
    const { context, width } = canvas;
    const { palette, settings } = scene;
    const gap = settings.sessionGapMinutes * MINUTE;
    const saves = [0, 0.45, 0.9, 2.1, 2.5].map((share) => Math.round(share * gap));
    const sittings: { start: number; end: number }[] = [];

    for (const at of saves) {
        const last = sittings.at(-1);

        if (last && sameSitting(last.end, at, gap)) {
            last.end = at;
        } else {
            sittings.push({ start: at, end: at });
        }
    }

    const span = saves[saves.length - 1] * 1.1;
    const left = 24;
    const plot = width - left * 2;
    const x = (at: number): number => left + (at / span) * plot;
    const y = 40;

    context.strokeStyle = rgba(palette.faint, 0.6);
    line(context, left, y, left + plot, y);

    for (const sitting of sittings) {
        context.fillStyle = rgba(palette.accent, 0.18);
        roundRect(context, x(sitting.start) - 8, y - 12, x(sitting.end) - x(sitting.start) + 16, 24, 12);
    }

    for (const at of saves) {
        circle(context, x(at), y, 5, palette.text);
    }

    label(context, palette, `one sitting: up to ${formatDuration(gap / 1000)} between saves`, left, y - 22, palette.accent, 10.5, 'left');
    label(context, palette, 'saves', left, y + 28, palette.faint, 10.5, 'left');

    return [
        `Five saves, as many minutes apart as the timeline shows, make `,
        { strong: `${sittings.length} ${sittings.length === 1 ? 'sitting' : 'sittings'}` },
        '. Each sitting is one bead in a note’s history, and the link between two notes saved in one is traced.'
    ];
}

// ---------------------------------------------------------------- The graph: clusters

const CLUSTER_NOTES: readonly { id: string; days: number; folder: string; x: number; y: number }[] = [
    { id: 'Plan', days: 0.1, folder: 'Work', x: 0.12, y: 0.36 },
    { id: 'Sprint', days: 20, folder: 'Work', x: 0.25, y: 0.16 },
    { id: 'Specs', days: 45, folder: 'Work', x: 0.27, y: 0.6 },
    { id: 'Retro', days: 90, folder: 'Work', x: 0.42, y: 0.38 },
    { id: 'Trips', days: 200, folder: 'Archive', x: 0.6, y: 0.28 },
    { id: 'Recipes', days: 250, folder: 'Archive', x: 0.74, y: 0.14 },
    { id: 'Books', days: 3, folder: 'Archive', x: 0.72, y: 0.6 },
    { id: 'Garden', days: 5, folder: 'Archive', x: 0.93, y: 0.3 },
    { id: 'Taxes', days: 150, folder: 'Archive', x: 0.88, y: 0.8 }
];

const CLUSTER_LINKS: readonly [string, string][] = [
    ['Plan', 'Sprint'], ['Plan', 'Specs'], ['Sprint', 'Retro'], ['Specs', 'Retro'], ['Retro', 'Trips'],
    ['Trips', 'Recipes'], ['Trips', 'Books'], ['Recipes', 'Books'], ['Garden', 'Taxes']
];

/**
 * A small graph of nine notes in two folders, for the glow and the group
 * temperature. Both run through the graph's own pooling, glow first and then
 * temperature, the order the graph applies them in.
 */
function drawClusters(canvas: Canvas, scene: Scene): Words {
    const { context, width, height } = canvas;
    const { palette, settings, times, now, source } = scene;
    const newest = times.at(-1) ?? now;
    const pathOf = (id: string): string => `${CLUSTER_NOTES.find((note) => note.id === id)?.folder ?? ''}/${id}.md`;
    const graph = linkedGraph(CLUSTER_NOTES.map((note) => pathOf(note.id)), CLUSTER_LINKS.map(([a, b]) => [pathOf(a), pathOf(b)]));

    const own = new Map(CLUSTER_NOTES.map((note) => [pathOf(note.id), source.opacityAt(newest - note.days * DAY)]));
    const glowed = settings.neighbourBleed > 0 ? poolNeighbours(graph, own, settings.neighbourBleed, settings.neighbourHops) : own;
    const drawn = settings.clusterWarmth > 0 ? warmByGroup(graph, glowed, settings.clusterWarmth, settings.clusterBy) : glowed;

    const boxes: [string, number, number][] = settings.clusterBy === 'folder'
        ? [['Work folder', 0.04, 0.5], ['Archive folder', 0.53, 0.98]]
        : [['One island of linked notes', 0.04, 0.82], ['Another', 0.84, 0.98]];

    if (settings.clusterWarmth > 0) {
        for (const [name, from, to] of boxes) {
            context.fillStyle = rgba(palette.faint, 0.08);
            context.strokeStyle = rgba(palette.faint, 0.3);
            roundRect(context, from * width, 6, (to - from) * width, height - 12, 10, true);
            label(context, palette, name, from * width + 8, height - 12, palette.faint, 10.5, 'left');
        }
    }

    const place = (id: string): { x: number; y: number } => {
        const note = CLUSTER_NOTES.find((candidate) => candidate.id === id);
        return { x: (note?.x ?? 0) * width, y: 18 + (note?.y ?? 0) * (height - 46) };
    };

    context.strokeStyle = hex(blendRgb(palette.background, palette.line, 0.85));
    context.lineWidth = 1.2;

    for (const [a, b] of CLUSTER_LINKS) {
        const p = place(a);
        const q = place(b);
        line(context, p.x, p.y, q.x, q.y);
    }

    context.lineWidth = 1;
    let moved = 0;

    CLUSTER_NOTES.forEach((note, index) => {
        const path = pathOf(note.id);
        const before = own.get(path) ?? 0;
        const after = drawn.get(path) ?? before;
        const at = place(note.id);
        const radius = 8 * nodeScale(after, settings);

        if (Math.abs(after - before) > 1e-6) {
            moved++;
        }

        circle(context, at.x, at.y, radius, drawnRgb(palette.node, after, palette));
        label(context, palette, note.id, at.x, at.y + radius + 13, palette.text, 11, 'center');
        canvas.hits.push({ x: at.x, y: at.y, r: radius });

        if (canvas.hovered === index) {
            label(context, palette, `${formatAge(newest - note.days * DAY, now)} · ${before.toFixed(2)} → ${after.toFixed(2)}`, at.x, at.y - radius - 7, palette.muted, 11, 'center');
        }
    });

    return [
        settings.neighbourBleed > 0 ? `Glow lifts a note next to a brighter one to ${settings.neighbourBleed} of its brightness, ${settings.neighbourHops} ${settings.neighbourHops === 1 ? 'link' : 'links'} out. ` : 'No glow. ',
        settings.clusterWarmth > 0 ? `Temperature pulls each note ${Math.round(settings.clusterWarmth * 100)}% of the way to its group's middle. ` : 'No temperature. ',
        { strong: `${moved} of 9` },
        ' notes moved. Hover one for before and after.'
    ];
}

/** A graph of paths and the links between them, as pooling and grouping read one. */
export function linkedGraph(paths: string[], links: [string, string][]): LinkedGraph {
    const nodeLookup: LinkedGraph['nodeLookup'] = {};

    for (const path of paths) {
        nodeLookup[path] = { id: path, forward: {}, reverse: {} };
    }

    const drawnLinks = links.map(([from, to]) => {
        const source = nodeLookup[from];
        const target = nodeLookup[to];
        (source.forward ?? {})[to] = true;
        (target.reverse ?? {})[from] = true;
        return { source, target };
    });

    return { nodeLookup, links: drawnLinks };
}

// ---------------------------------------------------------------- The graph: local graph

const LOCAL_NOTES: readonly { name: string; days: number; x: number; y: number }[] = [
    { name: 'Project brief', days: 30, x: 0.5, y: 0.47 },
    { name: 'Kickoff', days: 29.9, x: 0.28, y: 0.2 },
    { name: 'Budget', days: 31, x: 0.72, y: 0.2 },
    { name: 'Status', days: 2, x: 0.82, y: 0.55 },
    { name: 'Risks', days: 90, x: 0.66, y: 0.85 },
    { name: 'Today', days: 0.5, x: 0.34, y: 0.85 },
    { name: 'Vendors', days: 200, x: 0.18, y: 0.55 }
];

/**
 * A local graph around one note. Measured against the panel's own notes or
 * from the note in the middle, through a store of its own holding just these
 * seven, which is what the plugin does with the notes in a real panel.
 */
function drawLocal(canvas: Canvas, scene: Scene): Words {
    const { context, width, height } = canvas;
    const { palette, settings, times, now, source } = scene;
    const newest = times.at(-1) ?? now;
    const notes = LOCAL_NOTES.map((note) => ({ ...note, path: `Example/${note.name}.md`, mtime: newest - note.days * DAY }));
    const store = storeOf(settings, notes);
    const paths = notes.map((note) => note.path);

    const measured = settings.localAnchor
        ? store.aroundAnchor(paths, notes[0].path, settings.spreadFloorHours)
        : settings.localScope === 'graph' ? store.spreadAcross(paths, settings.spreadFloorHours) : null;
    const values = notes.map((note) => measured?.get(note.path) ?? source.opacityAt(note.mtime));

    const centre = width / 2;
    const across = Math.min(width, 520);
    const place = (note: { x: number; y: number }): { x: number; y: number } => ({ x: centre + (note.x - 0.5) * across, y: 16 + note.y * (height - 44) });

    context.strokeStyle = hex(blendRgb(palette.background, palette.line, 0.85));

    for (const note of notes.slice(1)) {
        const p = place(notes[0]);
        const q = place(note);
        line(context, p.x, p.y, q.x, q.y);
    }

    notes.forEach((note, index) => {
        const at = place(note);
        const radius = (index === 0 ? 11 : 8) * nodeScale(values[index], settings);
        circle(context, at.x, at.y, radius, drawnRgb(palette.node, values[index], palette));

        if (index === 0) {
            context.strokeStyle = rgba(palette.accent, 0.9);
            context.beginPath();
            context.arc(at.x, at.y, radius + 2, 0, Math.PI * 2);
            context.stroke();
        }

        label(context, palette, note.name, at.x, at.y + radius + 13, palette.text, 11, 'center');
        canvas.hits.push({ x: at.x, y: at.y, r: radius });

        if (settings.localLabels || canvas.hovered === index) {
            label(context, palette, formatAge(note.mtime, now), at.x, at.y - radius - 6, palette.muted, 10.5, 'center');
        }
    });

    const span = settings.maxOpacity - settings.minOpacity;
    const spread = span <= 0 ? 0 : (Math.max(...values) - Math.min(...values)) / span;

    if (settings.localAnchor) {
        return ['Measured from the note in the middle: a note is bright for being written ', { strong: 'near the same time' }, ', not for being new.'];
    }

    if (settings.localScope === 'graph' && measured) {
        return ["Against the panel's own seven notes, they spread across ", { strong: `${Math.round(spread * 100)}%` }, ' of the range.'];
    }

    return ['Against the whole vault, these seven spread across ', { strong: `${Math.round(spread * 100)}%` }, ' of the range.'];
}

// ---------------------------------------------------------------- Highlights: spotlight and pins

/**
 * The same five notes as the size picture, with whatever the spotlight covers
 * among them in its colour and size, and the oldest pinned for the example,
 * painted the way the graph paints both.
 */
function drawHighlights(canvas: Canvas, scene: Scene): Words {
    const { context, width } = canvas;
    const { palette, settings, times, now, source } = scene;
    const five = spaced(times, 5).reverse();
    const lit = source.spotlitTimes();
    const spot = palette.light ? legibleOnLight(parseColour(settings.spotlightColor)) : parseColour(settings.spotlightColor);
    const pin = parseColour(settings.pinColor);
    let spotlit: string | null = null;

    five.forEach((mtime, index) => {
        const pinned = index === five.length - 1 && five.length > 1;
        const value = pinned ? settings.maxOpacity : source.opacityAt(mtime);
        let colour = drawnRgb(palette.node, value, palette);
        let radius = 7 * nodeScale(value, settings);

        if (pinned && settings.pinMark) {
            colour = drawnRgb(blendRgb(palette.node, pin, settings.pinStrength), Math.min(1, value), palette);
        } else if (!pinned && lit.has(mtime)) {
            colour = drawnRgb(blendRgb(palette.node, spot, settings.spotlightStrength), Math.min(1, value), palette);
            radius *= settings.spotlightSize;
            spotlit ??= FIVE_NAMES[index];
        }

        const x = (width * (index + 0.5)) / five.length;
        const y = 58;
        circle(context, x, y, radius, colour);
        label(context, palette, FIVE_NAMES[index], x, y + radius + 18, palette.text, 12, 'center');
        label(context, palette, pinned ? 'pinned' : formatAge(mtime, now), x, y + radius + 32, palette.faint, 10.5, 'center');
    });

    const words: Words = [];

    if (!settings.spotlightNewest) {
        words.push('The spotlight is off. ');
    } else if (spotlit) {
        words.push('Spotlit: ', { strong: spotlit }, '. ');
    } else {
        words.push(settings.spotlightBy === 'window' ? `Nothing here was touched in the last ${formatDuration(settings.spotlightMinutes * 60)}, so the spotlight is dark. ` : 'The spotlight covers none of these five. ');
    }

    words.push(settings.pinMark
        ? 'Old ideas is pinned for the example, held at the brightest in the pin colour.'
        : 'Old ideas is pinned for the example: with no colour it reads as edited this morning.');

    return words;
}

// ---------------------------------------------------------------- Animate: the replay

const REPLAY_NOTES = 22;
/** How long the example's wave takes to cross the vault, in real time. */
const REPLAY_PASS_MS = 8000;

/**
 * The graph's own timelapse along one line, oldest at the left: a note appears
 * when the wave reaches it and, with the replay lit, is brightest as it is
 * written. Through a store holding just these notes, the way the plugin lights
 * each note in a real replay.
 */
function replayPicture(holder: HTMLElement, request: () => void): Picture {
    const controls = { at: 0.62, playing: false, started: 0, from: 0.62 };

    const picture = canvasPicture(holder, 104, (canvas, scene) => {
        const { context, width } = canvas;
        const { palette, settings, times, source } = scene;
        const notes = spaced(times, REPLAY_NOTES).map((mtime, index) => ({ mtime, path: `Replay/${index}.md` }));

        if (notes.length === 0) {
            return [];
        }

        if (controls.playing) {
            controls.at = (controls.from + (scene.now - controls.started) / REPLAY_PASS_MS) % 1.1;
        }

        // Along the line by place rather than by date, the way Obsidian's
        // timelapse steps: a note at a time, however far apart they were.
        const first = notes[0].mtime;
        const last = notes[notes.length - 1].mtime;
        const reached = Math.min(1, controls.at) * (notes.length - 1);
        const below = notes[Math.floor(reached)];
        const above = notes[Math.min(notes.length - 1, Math.ceil(reached))];
        const playhead = below.mtime + (above.mtime - below.mtime) * (reached - Math.floor(reached));
        const x = (place: number): number => 18 + (notes.length <= 1 ? 1 : place / (notes.length - 1)) * (width - 36);
        const shown = notes.filter((note) => note.mtime <= playhead);
        const lit = settings.replay ? storeOf(settings, notes).replayedAt(shown.map((note) => note.path), playhead, settings.replayTrailDays) : null;

        context.strokeStyle = rgba(palette.faint, 0.5);
        line(context, 18, 80, width - 18, 80);
        label(context, palette, formatAge(first, scene.now), 18, 96, palette.faint, 10.5, 'left');
        label(context, palette, formatAge(last, scene.now), width - 18, 96, palette.faint, 10.5, 'right');

        shown.forEach((note, index) => {
            const value = lit?.get(note.path) ?? source.opacityAt(note.mtime);
            circle(context, x(index), 34 + ((index * 7) % 5) * 7, 6 * nodeScale(value, settings), drawnRgb(palette.node, value, palette));
        });

        context.strokeStyle = rgba(palette.accent, 0.85);
        line(context, x(reached), 14, x(reached), 84);

        return settings.replay
            ? ['Each note is brightest as the wave writes it and fades to the dimmest ', { strong: formatDuration(settings.replayTrailDays * 86400) }, ' of vault time behind it.']
            : ["Unlit: every note is drawn at today's brightness, so most of a replay is a dark graph that lights up at the end."];
    }, () => controls.playing);

    const row = holder.createDiv({ cls: 'pulsar-graph-picture-try' });
    const play = row.createEl('button', { text: 'Play' });
    const scrub = row.createEl('input', { type: 'range' });
    scrub.min = '0';
    scrub.max = '1000';
    scrub.value = String(Math.round(controls.at * 1000));
    row.createSpan({ text: "Obsidian's own timelapse button drives this in the graph" });
    holder.querySelector('.pulsar-graph-picture-caption')?.before(row);

    play.addEventListener('click', () => {
        controls.playing = !controls.playing;
        controls.from = controls.at >= 1 ? 0 : controls.at;
        controls.started = Date.now();
        play.setText(controls.playing ? 'Pause' : 'Play');
        request();
    });

    scrub.addEventListener('input', () => {
        controls.playing = false;
        play.setText('Play');
        controls.at = Number(scrub.value) / 1000;
        request();
    });

    return {
        draw: (scene, width) => {
            picture.draw(scene, width);
            scrub.value = String(Math.round(Math.min(1, controls.at) * 1000));
        },
        moving: picture.moving,
        destroy: () => {
            controls.playing = false;
        }
    };
}

// ---------------------------------------------------------------- Highlights: in a note

const NOTE_FRESH = 'Decided to ship the beta on Friday.';
/** How long the example's writing takes to cool, at most, however long the setting is. */
const NOTE_COOLING_MS = 8000;
const NOTE_TYPING_MS = 45;

/**
 * A paragraph as the editor shows it: a dot after each link, at the linked
 * note's brightness, then a sentence typed and left to cool through the same
 * shades and the same stylesheet the editor uses.
 */
function notePicture(holder: HTMLElement, request: () => void): Picture {
    const page = holder.createDiv({ cls: 'pulsar-graph-picture-frame pulsar-graph-picture-page' });
    const row = holder.createDiv({ cls: 'pulsar-graph-picture-try' });
    const again = row.createEl('button', { text: 'Write it again' });
    row.createSpan({ text: 'Types the last sentence, then lets it cool' });
    const caption = holder.createDiv({ cls: 'pulsar-graph-picture-caption' });
    let typedAt = 0;

    again.addEventListener('click', () => {
        typedAt = Date.now();
        request();
    });

    const speed = (settings: PulsarGraphSettings): number => Math.max(1, (shadeMs(settings.inkMinutes) * INK_SHADES) / NOTE_COOLING_MS);
    const shadeOf = (index: number, scene: Scene): number => {
        const typed = typedAt + index * NOTE_TYPING_MS;
        return scene.now < typed ? -1 : Math.floor(((scene.now - typed) * speed(scene.settings)) / shadeMs(scene.settings.inkMinutes));
    };
    const lastShade = (scene: Scene): number => shadeOf(NOTE_FRESH.length - 1, scene);

    return {
        draw: (scene) => {
            const { settings, times, now } = scene;

            if (typedAt === 0) {
                typedAt = now;
            }

            const newest = times.at(-1) ?? now;
            const oldest = times.at(0) ?? now;
            const shades = [...NOTE_FRESH].map((_character, index) => (settings.ink ? shadeOf(index, scene) : INK_SHADES));
            const shown = [settings.ink, settings.inkMode, settings.inkColor, settings.inkDim, settings.inkMinutes, settings.linkDots, shades, [newest, oldest].map((mtime) => [scene.source.opacityAt(mtime).toFixed(3), formatAge(mtime, now)])];

            if (unchanged(page, JSON.stringify(shown))) {
                return;
            }

            page.empty();
            page.setCssProps({ ...inkColoursFor(settings.inkColor, settings.inkDim), '--pulsar-ink-ease': `${Math.round(Math.min(1500, shadeMs(settings.inkMinutes) / speed(settings)))}ms` });

            const lit = settings.ink && shadeOf(0, scene) >= 0 && shadeOf(0, scene) < INK_SHADES;
            const cold = settings.ink && settings.inkMode === 'dim' && lit ? 'pulsar-ink-cold' : '';
            const paragraph = page.createDiv();

            paragraph.createSpan({ cls: cold, text: 'Notes from the call about the ' });
            writeLink(paragraph, 'Roadmap', newest, scene, cold);
            paragraph.createSpan({ cls: cold, text: " and last spring's " });
            writeLink(paragraph, 'Budget review', oldest, scene, cold);
            paragraph.createSpan({ cls: cold, text: '. ' });

            [...NOTE_FRESH].forEach((character, index) => {
                // With fresh writing off there is nothing to watch being
                // written, so the sentence is simply there.
                const shade = shades[index];

                if (shade < 0) {
                    return;
                }

                const lettered = paragraph.createSpan({ text: character });

                if (settings.ink && settings.inkMode === 'colour' && shade < INK_SHADES) {
                    lettered.addClass('pulsar-ink', `pulsar-ink-${shade}`);
                }
            });

            const words: Words = [];

            if (!settings.ink) {
                words.push('Fresh writing is off. ');
            } else {
                const fast = speed(settings);
                words.push('Cools over ', { strong: formatDuration(settings.inkMinutes * 60) }, fast > 1 ? `, shown ${fast >= 10 ? Math.round(fast) : fast.toFixed(1)}× faster. ` : '. ');
            }

            if (settings.linkDots) {
                words.push(`Each dot after a link is the linked note's brightness: ${formatAge(newest, now)} and ${formatAge(oldest, now)}.`);
            }

            writeCaption(caption, words);
        },
        moving: (scene) => scene.settings.ink && lastShade(scene) < INK_SHADES
    };

    function writeLink(paragraph: HTMLElement, name: string, mtime: number, scene: Scene, cold: string): void {
        paragraph.createSpan({ cls: ['pulsar-graph-picture-link', cold].filter(Boolean).join(' '), text: name });

        if (scene.settings.linkDots) {
            paragraph.appendChild(makeLinkDot({ strength: scene.source.opacityAt(mtime), colour: null, age: `Edited ${formatAge(mtime, scene.now)}` }));
        }
    }
}

// ---------------------------------------------------------------- Tabs

const TAB_EXAMPLES: readonly { name: string; ignored: number; at: number }[] = [
    { name: "Today's plan", ignored: 0, at: 4 },
    { name: 'Meeting notes', ignored: 60, at: 3 },
    { name: 'Reading list', ignored: 300, at: 2 }
];

/**
 * Three tabs drawn with Obsidian's own tab classes and the plugin's own marks:
 * the one you are in, one you looked at an hour ago, one left alone for five
 * hours. The stylesheet that fades and marks real tabs draws these.
 */
function tabsPicture(holder: HTMLElement): Picture {
    const frame = holder.createDiv({ cls: 'pulsar-graph-picture-frame pulsar-graph-picture-tabbar' });
    const caption = holder.createDiv({ cls: 'pulsar-graph-picture-caption' });
    const bar = frame.createDiv({ cls: 'workspace-tab-header-container-inner' });

    // Built once; a redraw only moves the marks, as the plugin does to real tabs.
    const tabs = TAB_EXAMPLES.map((example, index) => {
        const header = bar.createDiv({ cls: `workspace-tab-header${index === 0 ? ' is-active mod-active' : ''}` });
        const inner = header.createDiv({ cls: 'workspace-tab-header-inner' });
        setIcon(inner.createDiv({ cls: 'workspace-tab-header-inner-icon' }), 'file-text');
        inner.createDiv({ cls: 'workspace-tab-header-inner-title', text: example.name });
        const dot = inner.createDiv({ cls: TAB_MARKS.dot });
        setIcon(inner.createDiv({ cls: 'workspace-tab-header-inner-close-button' }), 'x');
        return { example, header, dot };
    });

    return {
        draw: (scene) => {
            const { settings, times, now, source } = scene;
            const five = spaced(times, 5);

            const looks = tabs.map(({ example }, index) => {
                const strength = source.opacityAt(five[example.at] ?? now);
                const fade = index === 0 || settings.tabFade === 'off'
                    ? 1
                    : fadeStrength({ mode: settings.tabFade, curve: settings.tabFadeCurve, after: settings.tabFadeAfter, floor: settings.tabFadeFloor }, example.ignored, strength);
                const stale = settings.staleTabs && index > 0 && example.ignored >= settings.staleTabAfter;

                return { strength: clamp(strength, 0, 1).toFixed(3), fade: fade.toFixed(3), stale };
            });

            if (unchanged(frame, JSON.stringify([looks, settings.tabDot, settings.tabFadeScope, settings.staleTabMark]))) {
                return;
            }

            tabs.forEach(({ header, dot }, index) => {
                const { strength, fade, stale } = looks[index];

                dot.toggle(settings.tabDot);
                dot.setCssProps({ opacity: strength });
                header.toggleClass(TAB_MARKS.faded, Number(fade) < 1);
                header.toggleClass(TAB_MARKS.whole, Number(fade) < 1 && settings.tabFadeScope === 'tab');
                header.setCssProps({ [TAB_MARKS.fade]: fade });
                header.toggleClass(TAB_MARKS.stale, stale);
                header.toggleClass(TAB_MARKS.zzz, stale && settings.staleTabMark === 'zzz');
            });

            const fading = settings.tabFade === 'off'
                ? 'No tab fades. '
                : settings.tabFade === 'attention' ? 'Fading by how long since you looked: Meeting notes an hour ago, Reading list five hours ago. ' : "Fading by each note's brightness in the graph. ";

            writeCaption(caption, [fading, settings.tabDot ? 'The dot is each note’s brightness in the graph.' : '']);
        },
        moving: () => false
    };
}

// ---------------------------------------------------------------- Setup: the history

/** Minutes ago of each save to an example note: a session today, one yesterday, a week of work, older visits. */
const HISTORY_SAVES = [
    ...Array.from({ length: 11 }, (_unused, index) => 10 + index * 3),
    1440 + 12, 1440 + 55, 1440 + 60,
    ...Array.from({ length: 16 }, (_unused, index) => 5760 + index * 4),
    12960, 12990, 30240, 89280, 89285, 89310
];

/**
 * An example note's history, folded into sittings by the history's own rule
 * and drawn by the history view's own code, so it reads exactly as the view
 * will once it has something to show.
 */
function historyPicture(holder: HTMLElement): Picture {
    const frame = holder.createDiv({ cls: 'pulsar-graph-picture-frame pulsar-graph-picture-history pulsar-graph-history' });
    const caption = holder.createDiv({ cls: 'pulsar-graph-picture-caption' });

    return {
        draw: (scene) => {
            const { settings, now, source } = scene;

            if (!settings.history) {
                if (!unchanged(frame, 'off')) {
                    frame.empty();
                    frame.createDiv({ cls: 'pulsar-graph-history-empty-title', text: 'The edit history is switched off' });
                }

                writeCaption(caption, []);
                return;
            }

            const gap = settings.sessionGapMinutes * MINUTE;
            const beads: Bead[] = [];
            let size = 400;

            for (const minutesAgo of [...HISTORY_SAVES].sort((a, b) => b - a)) {
                const at = now - minutesAgo * MINUTE;
                const last = beads.at(-1);
                size += 90;

                if (last && sameSitting(last.end, at, gap)) {
                    last.end = at;
                    last.sizeEnd = size;
                } else {
                    beads.push({ start: at, end: at, sizeStart: last?.sizeEnd ?? size, sizeEnd: size });
                }
            }

            const kept = beads.slice(-settings.historyCap);

            // The rail's labels read in minutes, and its beads at the curve's brightness.
            if (!unchanged(frame, JSON.stringify([Math.floor(now / MINUTE), kept.map((bead) => [bead.start - now, bead.end - now, source.opacityAt(bead.end).toFixed(3)])]))) {
                frame.empty();
                frame.createDiv({ cls: 'pulsar-graph-history-title', text: 'Project brief' });
                drawHistory(frame, kept, now, source.opacityAt);
            }

            writeCaption(caption, ['An example note, as the history view draws it: one bead per sitting, on one scale back from now for every note. Hover a bead.']);
        },
        moving: () => false
    };
}

// ---------------------------------------------------------------- shared

/** `count` of the vault's times, evenly by place, oldest first. All of them when there are fewer. */
export function spaced(times: readonly number[], count: number): number[] {
    return spacedPlaces(times.length, count).map((place) => times[place]);
}

/** `count` places out of `length`, evenly, first to last, without repeats. Every place when there are fewer. */
export function spacedPlaces(length: number, count: number): number[] {
    if (length <= count) {
        return Array.from({ length }, (_unused, place) => place);
    }

    if (count <= 1) {
        return count === 1 ? [length - 1] : [];
    }

    return Array.from({ length: count }, (_unused, index) => Math.round((index / (count - 1)) * (length - 1)));
}

/**
 * How the graph draws a node of this colour at this strength, over the
 * picture's background. Up to 1 it is the colour over the background at that
 * opacity. Past 1 the renderer multiplies each channel by the opacity and
 * clamps it, so a dark theme's grey climbs to white; on a light theme the
 * plugin deepens it toward black instead, through the same function the graph
 * uses.
 */
export function drawnRgb(rgb: number, strength: number, palette: Pick<Palette, 'light' | 'background'>): number {
    if (strength > 1) {
        return palette.light ? deepenRgb(rgb, strength) : brighten(rgb, strength);
    }

    return blendRgb(palette.background, rgb, Math.max(0, strength));
}

/** Each channel multiplied and clamped, which is what the renderer does past full alpha. */
function brighten(rgb: number, by: number): number {
    const channel = (shift: number): number => Math.min(255, Math.round(((rgb >> shift) & 0xff) * by));

    return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** How far toward full white (dark) or full black (light) a colour is from the background, 0 to 1. */
export function seenStrength(rgb: number, palette: Pick<Palette, 'light' | 'background'>): number {
    const target = palette.light ? 0 : 255;
    const from = luminance(palette.background);
    const reach = Math.abs(target - from);

    return reach === 0 ? 1 : Math.abs(luminance(rgb) - from) / reach;
}

function luminance(rgb: number): number {
    return (((rgb >> 16) & 0xff) + ((rgb >> 8) & 0xff) + (rgb & 0xff)) / 3;
}

/** A node's size for its brightness, as the graph sizes it, through the graph's own function. */
function nodeScale(value: number, settings: PulsarGraphSettings): number {
    if (!settings.nodeSizeByAge) {
        return 1;
    }

    const span = settings.maxOpacity - settings.minOpacity;
    const strength = span <= 0 ? 1 : (value - settings.minOpacity) / span;

    return sizeScale(strength, { smallest: settings.nodeSizeSmallest, largest: settings.nodeSizeLargest });
}

/**
 * A store holding only the example's notes, measured with the live settings.
 * The plugin measures a local graph and a replay against the notes in them in
 * just this way.
 */
function storeOf(settings: PulsarGraphSettings, notes: { path: string; mtime: number }[]): OpacityStore {
    const store = new OpacityStore(() => settings);
    store.build(notes.map((note) => exampleFile(note.path, note.mtime)));
    store.refresh();
    return store;
}

/** A file the store can read: a path and its two timestamps, both the same moment here. */
function exampleFile(path: string, mtime: number): NoteFile {
    return { path, stat: { mtime, ctime: mtime, size: 0 } };
}

/**
 * The theme's colours, read from where the settings are drawn. A canvas turns
 * whatever a theme wrote — a name, `hsl()`, a variable resolved to either —
 * into a form `parseColour` reads.
 */
function readPalette(element: HTMLElement, light: boolean): Palette {
    const style = element.win.getComputedStyle(element);
    const probe = colourProbe();
    const read = (name: string, fallback: number, over: number): number => {
        const value = style.getPropertyValue(name).trim();

        if (!probe || value.length === 0) {
            return fallback;
        }

        probe.fillStyle = hex(fallback);
        probe.fillStyle = value;
        return parseColour(String(probe.fillStyle), fallback, over);
    };

    const background = read('--background-primary', light ? 0xffffff : 0x1e1e1e, light ? 0xffffff : 0x1e1e1e);
    const parse = (name: string, fallback: number): number => read(name, fallback, background);

    return {
        light,
        background,
        node: parse('--graph-node', light ? 0x5c5c5c : 0xb3b3b3),
        line: parse('--graph-line', light ? 0xb5b5b5 : 0x6b6b6b),
        text: parse('--text-normal', light ? 0x222222 : 0xdadada),
        muted: parse('--text-muted', light ? 0x5c5c5c : 0xa3a3a3),
        faint: parse('--text-faint', light ? 0xababab : 0x6b6b6b),
        accent: parse('--interactive-accent', light ? 0x7357e8 : 0x8a72f0),
        font: style.getPropertyValue('--font-interface').trim() || style.fontFamily
    };
}

/** One small canvas for reading colours, made once: making a 2D context costs more than the rest of a redraw. */
let probeContext: CanvasRenderingContext2D | null | undefined;

function colourProbe(): CanvasRenderingContext2D | null {
    if (probeContext === undefined) {
        const canvas = createEl('canvas');
        canvas.width = canvas.height = 1;
        probeContext = canvas.getContext('2d');
    }

    return probeContext;
}

/**
 * A colour as a packed number, from a hex string or the `rgba()` a canvas
 * normalises anything else to. A colour with transparency is laid over the
 * background, since that is what it looks like on the page.
 */
export function parseColour(value: string, fallback = 0x888888, background = 0x000000): number {
    const text = value.trim();

    if (/^#[0-9a-f]{6}$/i.test(text)) {
        return parseInt(text.slice(1), 16);
    }

    if (/^#[0-9a-f]{3}$/i.test(text)) {
        return parseInt([...text.slice(1)].map((digit) => digit + digit).join(''), 16);
    }

    const parts = /rgba?\(([^)]+)\)/i.exec(text)?.[1].split(',').map((part) => Number.parseFloat(part));

    if (!parts || parts.length < 3 || parts.slice(0, 3).some((part) => !Number.isFinite(part))) {
        return fallback;
    }

    const rgb = (clamp(Math.round(parts[0]), 0, 255) << 16) | (clamp(Math.round(parts[1]), 0, 255) << 8) | clamp(Math.round(parts[2]), 0, 255);
    const alpha = parts.length > 3 && Number.isFinite(parts[3]) ? clamp(parts[3], 0, 1) : 1;

    return alpha >= 1 ? rgb : blendRgb(background, rgb, alpha);
}

function hex(rgb: number): string {
    return `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`;
}

function rgba(rgb: number, alpha: number): string {
    return `rgba(${(rgb >> 16) & 0xff}, ${(rgb >> 8) & 0xff}, ${rgb & 0xff}, ${alpha})`;
}

function circle(context: CanvasRenderingContext2D, x: number, y: number, radius: number, rgb: number): void {
    context.fillStyle = hex(rgb);
    context.beginPath();
    context.arc(x, y, Math.max(0.5, radius), 0, Math.PI * 2);
    context.fill();
}

function line(context: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, stroke = false): void {
    context.beginPath();
    context.roundRect(x, y, Math.max(0, width), height, radius);
    context.fill();

    if (stroke) {
        context.stroke();
    }
}

/**
 * Text with a ring of the background round it, so a link running under a title
 * never cuts through it.
 */
function label(context: CanvasRenderingContext2D, palette: Palette, text: string, x: number, y: number, rgb: number, size: number, align: CanvasTextAlign): void {
    context.font = `${size}px ${palette.font}`;
    context.textAlign = align;
    context.lineJoin = 'round';
    context.lineWidth = 3;
    context.strokeStyle = hex(palette.background);
    context.strokeText(text, x, y);
    context.fillStyle = hex(rgb);
    context.fillText(text, x, y);
}

function clamp(value: number, lowest: number, highest: number): number {
    return Math.min(Math.max(value, lowest), highest);
}
