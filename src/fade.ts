export const FADE_TYPES = ['linear', 'exponential', 'step'] as const;

export type FadeType = (typeof FADE_TYPES)[number];

export const FADE_TYPE_LABELS: Record<FadeType, string> = {
    linear: 'Linear',
    exponential: 'Exponential',
    step: 'Step'
};

export interface FadeOptions {
    steepness: number;
    numSteps: number;
}

/**
 * What the sharpness slider offers. One exponent shapes the whole curve: 1 is
 * a straight line, above it only the newest notes stay bright, and below it
 * more of the vault stays lit.
 */
export const SHARPNESS_STOPS = [0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 2.5, 3, 4, 6] as const;

/** The two settings a curve is stored in. */
export interface FadeShape {
    fadeType: FadeType;
    steepness: number;
}

/**
 * The exponent a curve is drawn with. A straight line is 1 and an exponential
 * curve is its steepness, which is all the sharpness is: the slider writes the
 * same two settings the old dropdown did, so a saved setting means the same in
 * a version from before it. Bands keep the sharpness they go back to.
 */
export function sharpnessOf(shape: FadeShape): number {
    return shape.fadeType === 'linear' ? 1 : shape.steepness;
}

/** A smooth curve of this sharpness, as it is stored. */
export function curveAt(sharpness: number): FadeShape {
    return { fadeType: sharpness === 1 ? 'linear' : 'exponential', steepness: sharpness };
}

/** Bands, keeping the sharpness to go back to when they are switched off. */
export function banded(shape: FadeShape): FadeShape {
    return { fadeType: 'step', steepness: sharpnessOf(shape) };
}

/** A sharpness as the slider writes it beside itself. */
export function formatSharpness(sharpness: number): string {
    return `× ${Math.round(sharpness * 100) / 100}`;
}

/**
 * Shapes a note's recency (0 for the oldest note in the vault, 1 for the
 * newest) into the fraction of the opacity range it should receive.
 */
export function shapeRecency(fadeType: FadeType, recency: number, options: FadeOptions): number {
    switch (fadeType) {
        case 'linear':
            return recency;
        case 'exponential':
            return Math.pow(recency, options.steepness);
        case 'step':
            return quantize(recency, options.numSteps);
    }
}

/** Collapses recency onto evenly spaced levels so notes form distinct bands. */
function quantize(recency: number, numSteps: number): number {
    if (numSteps <= 1) {
        return 1;
    }

    const topStep = numSteps - 1;
    return Math.round(recency * topStep) / topStep;
}
