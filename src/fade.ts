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
