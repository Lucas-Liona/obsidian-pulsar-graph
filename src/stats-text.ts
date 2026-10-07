/**
 * What separates one figure from the next wherever the plugin reports
 * numbers: under the range bar, across the top of a graph, in the status bar
 * and in the statistics. One place, so it stays one choice.
 *
 * Not a comma. A comma reads as part of a sentence, and "230 of 1100 notes
 * (21%), 12 minutes ago back to 1 month ago" is three figures, not a clause.
 */
export const SEPARATOR = ' · ';

/** Joins figures with the separator, skipping any that are empty. */
export function joinStats(...parts: (string | null | undefined | false)[]): string {
    return parts.filter((part): part is string => typeof part === 'string' && part.length > 0).join(SEPARATOR);
}

/**
 * Writes figures into an element one span each, so a narrow panel wraps
 * between figures rather than in the middle of one.
 */
export function writeStats(element: HTMLElement, text: string): void {
    element.empty();

    text.split(SEPARATOR).forEach((part, index) => {
        if (index > 0) {
            element.appendText(SEPARATOR);
        }

        element.createSpan({ cls: 'pulsar-graph-stat-part', text: part });
    });
}
