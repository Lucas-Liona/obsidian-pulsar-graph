import { describe, expect, it } from 'vitest';
import { findLinks } from '../src/link-dots';

describe('findLinks', () => {
    it('finds a wikilink and puts the dot after its closing brackets', () => {
        const text = 'See [[Topology]] here.';

        expect(findLinks(text)).toEqual([{ end: text.indexOf(' here'), linkpath: 'Topology' }]);
    });

    it('keeps only the note part of an alias, heading or block link', () => {
        const links = findLinks('[[Graph theory|graphs]] [[Notes/Probability#Bayes]] [[Topology^abc123]]');

        expect(links.map((link) => link.linkpath)).toEqual(['Graph theory', 'Notes/Probability', 'Topology']);
    });

    it('leaves out embeds', () => {
        expect(findLinks('![[Diagram]] and ![](Picture.md)')).toEqual([]);
    });

    it('leaves out a link to a heading in the same note', () => {
        expect(findLinks('[[#Further reading]] and [[^block]]')).toEqual([]);
    });

    it('finds a markdown link to a note, decoded', () => {
        const text = '[the notes](Graph%20theory.md#Trees) end';

        expect(findLinks(text)).toEqual([{ end: text.indexOf(' end'), linkpath: 'Graph theory.md' }]);
    });

    it('leaves out web links and other schemes', () => {
        expect(findLinks('[site](https://example.com) [mail](mailto:a@b.c) [vault](obsidian://open?x=1)')).toEqual([]);
    });

    it('reports positions in the document when given where the text starts', () => {
        expect(findLinks('[[A]]', 100)).toEqual([{ end: 105, linkpath: 'A' }]);
    });

    it('orders links by where they end, across both kinds', () => {
        const links = findLinks('[x](B.md) then [[A]]');

        expect(links.map((link) => link.linkpath)).toEqual(['B.md', 'A']);
    });

    it('survives a stray percent sign', () => {
        expect(findLinks('[x](100%25%.md)').map((link) => link.linkpath)).toEqual(['100%25%.md']);
    });
});
