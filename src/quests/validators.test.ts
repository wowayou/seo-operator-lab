import { describe, expect, it } from 'vitest';
import { evaluateCanonical } from './wordpress/canonical-duplicate-001/validator';
import { evaluateNoindex } from './wordpress/accidental-noindex-002/validator';

const canonical = '<link rel="canonical" href="https://example.test/sample-product/">';
const duplicate = '<link rel="canonical" href="https://example.test/legacy-product/">';
const schema = '<script type="application/ld+json" data-seo-lab="product-schema">{}</script>';

function canonicalObservation(overrides = {}) {
  return {
    targetHtml: `<head>${canonical}${schema}</head>`,
    targetStatus: 200,
    expectedCanonical: 'https://example.test/sample-product/',
    homepageHtml: '<head><link rel="canonical" href="https://example.test/"></head>',
    homepageStatus: 200,
    overrideCode: '<?php // no site override',
    ...overrides,
  };
}

describe('Duplicate Canonical Quest validator', () => {
  it('fails the deliberately duplicated target', () => {
    const result = evaluateCanonical(
      canonicalObservation({ targetHtml: `<head>${canonical}${duplicate}${schema}</head>` }),
    );
    expect(result.passed).toBe(false);
    expect(result.targetPassed).toBe(false);
    expect(result.checks.find((check) => check.id === 'canonical-count')?.actual).toBe('2');
  });

  it('passes a narrow lab repair while flagging its implementation quality', () => {
    const result = evaluateCanonical(canonicalObservation());
    expect(result.passed).toBe(true);
    expect(result.review?.level).toBe('lab');
  });

  it('rejects disabling the entire plugin because Product Schema regresses', () => {
    const result = evaluateCanonical(canonicalObservation({ targetHtml: `<head>${canonical}</head>` }));
    expect(result.targetPassed).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.checks.find((check) => check.id === 'product-schema-preserved')?.passed).toBe(false);
  });

  it('recognizes the site-owned hook override as production-grade', () => {
    const result = evaluateCanonical(
      canonicalObservation({
        overrideCode:
          "<?php add_action('init', function () { remove_action('wp_head', 'seo_lab_product_suite_duplicate_canonical', 20); });",
      }),
    );
    expect(result.passed).toBe(true);
    expect(result.review?.level).toBe('production');
  });
});

describe('Accidental Noindex Quest validator', () => {
  const noindex = '<meta name="robots" content="noindex, follow" data-seo-lab="noindex-rule">';

  it('fails when the public target contains noindex', () => {
    const result = evaluateNoindex({
      targetHtml: `<head>${noindex}</head>`,
      targetStatus: 200,
      controlHtml: `<head>${noindex}</head>`,
      controlStatus: 200,
    });
    expect(result.passed).toBe(false);
    expect(result.targetPassed).toBe(false);
  });

  it('passes when the target is indexable and the control remains noindex', () => {
    const result = evaluateNoindex({
      targetHtml: '<head><meta name="robots" content="max-image-preview:large"></head>',
      targetStatus: 200,
      controlHtml: `<head>${noindex}</head>`,
      controlStatus: 200,
    });
    expect(result.passed).toBe(true);
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it('reports a regression when an overbroad fix removes the control noindex', () => {
    const result = evaluateNoindex({
      targetHtml: '<head></head>',
      targetStatus: 200,
      controlHtml: '<head></head>',
      controlStatus: 200,
    });
    expect(result.targetPassed).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.checks.find((check) => check.id === 'control-noindex-preserved')?.passed).toBe(false);
  });
});
