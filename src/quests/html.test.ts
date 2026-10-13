import { describe, expect, it } from 'vitest';
import { inspectHtml, parseCanonicalLinks, parseRobotsDirectives, parseRobotsHeaders } from './html';
import { isRedirect, readHeader, readHeaders } from './http';

const page = (head: string) => `<html><head>${head}</head><body></body></html>`;

describe('HTML evidence parsing', () => {
  it('handles HTML5 attributes, casing, entities and quoted > characters', () => {
    expect(parseCanonicalLinks(page('<LINK data-note="a > b" REL="alternate CANONICAL" href="https://e.test/?a=1&amp;b=2">'))).toEqual(['https://e.test/?a=1&b=2']);
    expect(parseRobotsDirectives(page('<meta NAME=ROBOTS CONTENT=NONE>'))).toEqual(['noindex', 'nofollow']);
  });
  it('ignores lookalikes in data attributes, comments, scripts, templates and the body', () => {
    const forged = '<link rel=canonical href=https://e.test/><meta name=robots content=noindex>';
    const html = `<html><head><!-- ${forged} --><script>const x = '${forged}'</script><template>${forged}</template><link data-rel=canonical href=/wrong/><meta data-name=robots content=noindex></head><body>${forged}</body></html>`;
    expect(parseCanonicalLinks(html)).toEqual([]);
    expect(parseRobotsDirectives(html)).toEqual([]);
  });
  it('counts valid Product nodes in JSON-LD @graph, not arbitrary marker text', () => {
    const json = { '@context': 'https://schema.org', '@graph': [{ '@type': ['Thing', 'Product'], name: 'A' }] };
    expect(inspectHtml(page(`<script type="application/ld+json">${JSON.stringify(json)}</script>`)).productCount).toBe(1);
  });
  it('rejects an oversized document instead of blocking indefinitely', () => {
    expect(() => inspectHtml(' '.repeat(2_000_001))).toThrow('HTML');
  });
});

describe('HTTP robots evidence', () => {
  it('collects multiple values with case-insensitive header names', () => {
    const headers = { 'X-Robots-Tag': ['index', 'follow'], 'x-robots-tag': ['noindex'] };
    expect(readHeaders(headers, 'X-ROBOTS-TAG')).toEqual(['index', 'follow', 'noindex']);
    expect(readHeader(headers, 'x-robots-tag')).toBe('index');
  });
  it('preserves restrictive directives across generic and bot-specific values', () => {
    expect(parseRobotsHeaders(['index', 'googlebot: none, noarchive', 'bingbot: noindex'])).toContain('noindex');
  });
  it('does not apply another crawler’s scoped policy to generic robots', () => {
    expect(parseRobotsHeaders(['otherbot: noindex, nofollow', 'max-snippet: 0, index'])).not.toContain('noindex');
  });
  it('handles multiple crawler scopes within a header', () => {
    expect(parseRobotsHeaders(['otherbot: index, googlebot: noindex, nofollow'])).toContain('noindex');
  });
  it('distinguishes navigational redirects from cache and error responses', () => {
    for (const code of [301, 302, 303, 307, 308]) expect(isRedirect(code)).toBe(true);
    for (const code of [200, 300, 304, 404, 500]) expect(isRedirect(code)).toBe(false);
  });
});
