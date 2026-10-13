import { describe, expect, it } from 'vitest';
import { evaluateCanonical, type CanonicalObservation } from './wordpress/canonical-duplicate-001/validator';
import { evaluateNoindex, type NoindexObservation } from './wordpress/accidental-noindex-002/validator';
import { implementationReview, type OwnershipEvidence } from './review';

const canonical = '<link rel="canonical" href="https://example.test/sample-product/">';
const duplicate = '<link rel="canonical" href="https://example.test/legacy-product/">';
const schema = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Sample Product"}</script>';
const page = (head = '') => `<html><head>${head}</head><body><p>Content</p></body></html>`;
const ownership: OwnershipEvidence = { vendorUnchanged: true, overrideActive: true, overrideChanged: true, ruleEffective: true };

function canonicalObservation(overrides: Partial<CanonicalObservation> = {}): CanonicalObservation {
  return {
    targetHtml: page(canonical + schema), targetStatus: 200,
    expectedCanonical: 'https://example.test/sample-product/',
    homepageHtml: page('<link rel="canonical" href="https://example.test/">'), homepageStatus: 200,
    expectedHomepageCanonical: 'https://example.test/', ...overrides,
  };
}

function noindexObservation(overrides: Partial<NoindexObservation> = {}): NoindexObservation {
  return {
    targetHtml: page('<meta name="robots" content="max-image-preview:large">'), targetStatus: 200,
    controlHtml: page('<meta name="robots" content="noindex, follow">'), controlStatus: 200,
    publicHtml: page(), publicStatus: 200, ...overrides,
  };
}

function passedCheck(result: ReturnType<typeof evaluateCanonical>, id: string) {
  return result.checks.find((check) => check.id === id)?.passed;
}

describe('Duplicate Canonical Quest', () => {
  it('fails the deliberate duplicate', () => {
    const result = evaluateCanonical(canonicalObservation({ targetHtml: page(canonical + duplicate + schema) }));
    expect(result.targetPassed).toBe(false);
    expect(result.checks.find((check) => check.id === 'canonical-count')?.actual).toBe('2');
  });
  it('accepts a narrow lab repair', () => {
    const result = evaluateCanonical(canonicalObservation());
    expect(result.passed).toBe(true);
    expect(result.review?.level).toBe('lab');
  });
  it('accepts a runtime-proven site-owned repair', () => {
    expect(evaluateCanonical(canonicalObservation({ ownership })).review?.level).toBe('production');
  });
  it.each([
    ['', 'absent'], ['<div data-seo-lab="product-schema"></div>', 'fake marker'],
    ['<script type="application/ld+json" data-seo-lab="product-schema">{broken}</script>', 'invalid JSON'],
    [schema.replace('Product', 'Article'), 'wrong type'], [schema.replace('Sample Product', ''), 'empty name'],
    [schema + schema, 'duplicates'], [schema.replace('https://schema.org', 'https://wrong.example'), 'wrong context'],
  ])('rejects a schema regression: %s (%s)', (brokenSchema) => {
    const result = evaluateCanonical(canonicalObservation({ targetHtml: page(canonical + brokenSchema) }));
    expect(result.targetPassed).toBe(true);
    expect(result.passed).toBe(false);
    expect(passedCheck(result, 'product-schema-preserved')).toBe(false);
  });
  it.each(['', duplicate, '<link rel=canonical href=https://wrong.example/>', canonical + canonical])('rejects incorrect target links: %s', (links) => {
    expect(evaluateCanonical(canonicalObservation({ targetHtml: page(links + schema) })).passed).toBe(false);
  });
  it.each(['', '<!-- placeholder -->', '<link rel=canonical href=https://wrong.example/>'])('requires the original homepage canonical, not just absence of duplicates', (links) => {
    const result = evaluateCanonical(canonicalObservation({ homepageHtml: page(links) }));
    expect(result.targetPassed).toBe(true);
    expect(passedCheck(result, 'homepage-canonical-stable')).toBe(false);
  });
  it.each([301, 404, 500])('does not pass a %i target response', (status) => {
    expect(evaluateCanonical(canonicalObservation({ targetStatus: status })).passed).toBe(false);
  });
  it('does not accept a deleted or broken homepage', () => {
    expect(evaluateCanonical(canonicalObservation({ homepageStatus: 500 })).passed).toBe(false);
  });
});

describe('Accidental Noindex Quest', () => {
  it.each([
    '<meta name="robots" content="noindex, follow">',
    '<meta NAME=ROBOTS CONTENT=NONE>',
    '<meta name=robots content=index><meta name=robots content=noindex>',
    '<meta name=googlebot content=noindex>',
    '<meta name=bingbot content="NOINDEX">',
    '<meta name=robots content="no&#105;ndex">',
  ])('rejects a restrictive target directive: %s', (robots) => {
    expect(evaluateNoindex(noindexObservation({ targetHtml: page(robots) })).targetPassed).toBe(false);
  });
  it.each<Record<string, string[]>>([
    { 'X-Robots-Tag': ['noindex'] }, { 'x-robots-tag': ['googlebot: none'] },
    { 'X-Robots-Tag': ['index'], 'x-robots-tag': ['noindex'] },
  ])('checks all header values: %j', (targetHeaders) => {
    const result = evaluateNoindex(noindexObservation({ targetHeaders }));
    expect(passedCheck(result, 'target-indexable')).toBe(false);
  });
  it('passes a narrow repair with a control protected through HTTP', () => {
    const result = evaluateNoindex(noindexObservation({ controlHtml: page(), controlHeaders: { 'X-Robots-Tag': ['noindex'] } }));
    expect(result.passed).toBe(true);
    expect(result.review?.level).toBe('lab');
  });
  it('passes a site-owned production path with runtime evidence', () => {
    expect(evaluateNoindex(noindexObservation({ ownership })).review?.level).toBe('production');
  });
  it('rejects blanket removal of noindex', () => {
    const result = evaluateNoindex(noindexObservation({ controlHtml: page() }));
    expect(result.targetPassed).toBe(true);
    expect(result.passed).toBe(false);
    expect(passedCheck(result, 'control-noindex-preserved')).toBe(false);
  });
  it('does not treat a Googlebot-only exclusion as the original generic control policy', () => {
    const result = evaluateNoindex(noindexObservation({ controlHtml: page('<meta name=googlebot content=noindex>') }));
    expect(result.targetPassed).toBe(true);
    expect(passedCheck(result, 'control-noindex-preserved')).toBe(false);
    expect(evaluateNoindex(noindexObservation({ controlHtml: page(), controlHeaders: { 'X-Robots-Tag': ['googlebot: noindex'] } })).passed).toBe(false);
  });
  it('rejects a broader condition that noindexes every other public page', () => {
    const result = evaluateNoindex(noindexObservation({ publicHtml: page('<meta name=robots content=noindex>') }));
    expect(result.targetPassed).toBe(true);
    expect(passedCheck(result, 'public-page-preserved')).toBe(false);
  });
  it.each(['', 'PHP Fatal error', '<!-- <head></head> -->', '<body>No real head</body>'])('rejects missing HTML even when noindex is absent: %s', (targetHtml) => {
    expect(evaluateNoindex(noindexObservation({ targetHtml })).passed).toBe(false);
  });
  it.each([301, 404, 500])('rejects a %i target response', (targetStatus) => {
    expect(evaluateNoindex(noindexObservation({ targetStatus })).passed).toBe(false);
  });
  it.each(['controlStatus', 'publicStatus'] as const)('rejects unavailable control: %s', (field) => {
    const result = evaluateNoindex(noindexObservation({ [field]: 404 }));
    expect(result.targetPassed).toBe(true);
    expect(result.passed).toBe(false);
  });
});

describe('Implementation review is not a source-text regex', () => {
  it.each(['vendorUnchanged', 'overrideActive', 'overrideChanged', 'ruleEffective'] as const)('does not certify production without %s', (key) => {
    expect(implementationReview({ ...ownership, [key]: false }).level).toBe('lab');
  });
  it('defaults to lab without evidence', () => { expect(implementationReview().level).toBe('lab'); });
});
