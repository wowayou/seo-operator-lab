import type { PlaygroundClient } from '@wp-playground/client';
import { countMarkedElements, parseCanonicalLinks } from '../../html';
import type { ValidationCheck, ValidationResult } from '../../types';

export interface CanonicalObservation {
  targetHtml: string;
  targetStatus: number;
  expectedCanonical: string;
  homepageHtml: string;
  homepageStatus: number;
  overrideCode: string;
}

function createReview(overrideCode: string) {
  const usesSiteOwnedOverride = /remove_action\s*\(\s*['"]wp_head['"]\s*,\s*['"]seo_lab_product_suite_duplicate_canonical['"]\s*,\s*20\s*\)/.test(
    overrideCode,
  );
  return usesSiteOwnedOverride
    ? {
        level: 'production' as const,
        label: '生产级实现',
        summary: '修复位于站点自有插件中，不会因 Product Suite 更新而被覆盖。',
      }
    : {
        level: 'lab' as const,
        label: '实验修复',
        summary: '结果与回归都正确；直接修改供应方插件仍存在升级覆盖风险。',
      };
}

export function evaluateCanonical(observation: CanonicalObservation): ValidationResult {
  const targetCanonicals = parseCanonicalLinks(observation.targetHtml);
  const homepageCanonicals = parseCanonicalLinks(observation.homepageHtml);
  const schemaCount = countMarkedElements(observation.targetHtml, 'product-schema');
  const checks: ValidationCheck[] = [
    {
      id: 'http-status',
      name: '目标页面可以正常访问',
      group: 'target',
      passed: observation.targetStatus === 200,
      expected: '200',
      actual: String(observation.targetStatus),
    },
    {
      id: 'canonical-count',
      name: '目标页面只有一个 canonical',
      group: 'target',
      passed: targetCanonicals.length === 1,
      expected: '1',
      actual: String(targetCanonicals.length),
    },
    {
      id: 'canonical-url',
      name: 'canonical 指向目标页面',
      group: 'target',
      passed: targetCanonicals.length === 1 && targetCanonicals[0] === observation.expectedCanonical,
      expected: observation.expectedCanonical,
      actual: targetCanonicals.length ? targetCanonicals.join(', ') : '(none)',
    },
    {
      id: 'product-schema-preserved',
      name: 'Product Schema 仍然存在',
      group: 'regression',
      passed: schemaCount === 1,
      expected: '1 个 Product Schema',
      actual: `${schemaCount} 个`,
      details: '防止通过禁用整个 Product Suite 修复 canonical 时误删其必要功能。',
    },
    {
      id: 'homepage-canonical-stable',
      name: '首页 canonical 未受影响',
      group: 'regression',
      passed:
        observation.homepageStatus === 200 &&
        homepageCanonicals.length <= 1 &&
        !homepageCanonicals.some((href) => href.includes('/legacy-product/')),
      expected: 'HTTP 200；最多一个 canonical；不指向 legacy-product',
      actual: `HTTP ${observation.homepageStatus}；${homepageCanonicals.length ? homepageCanonicals.join(', ') : '(none)'}`,
    },
  ];
  const targetPassed = checks.filter((check) => check.group === 'target').every((check) => check.passed);
  const passed = checks.every((check) => check.passed);
  return {
    passed,
    targetPassed,
    checks,
    details: passed
      ? 'PASS: target checks and regression checks are all satisfied.'
      : targetPassed
        ? 'PARTIAL: the duplicate canonical is gone, but a required regression check failed.'
        : 'FAIL: the target still exposes an incorrect canonical state.',
    review: passed ? createReview(observation.overrideCode) : undefined,
  };
}

async function decodeRun(client: PlaygroundClient, code: string): Promise<string> {
  const response = await client.run({ code });
  return new TextDecoder().decode(response.bytes).trim();
}

export async function validate(client: PlaygroundClient): Promise<ValidationResult> {
  const expectedCanonical = await decodeRun(
    client,
    `<?php require_once '/wordpress/wp-load.php'; echo home_url('/sample-product/');`,
  );
  const target = await client.request({ url: '/sample-product/' });
  const homepageUrl = await decodeRun(
    client,
    `<?php
      require_once '/wordpress/wp-load.php';
      $front_page_id = (int) get_option('page_on_front');
      echo $front_page_id ? get_permalink($front_page_id) : home_url('/');
    `,
  );
  const homepage = await client.request({ url: homepageUrl });
  const overrideCode = await decodeRun(
    client,
    `<?php echo file_get_contents('/wordpress/wp-content/plugins/seo-lab-site-overrides/seo-lab-site-overrides.php');`,
  );
  return evaluateCanonical({
    targetHtml: new TextDecoder().decode(target.bytes),
    targetStatus: target.httpStatusCode,
    expectedCanonical,
    homepageHtml: new TextDecoder().decode(homepage.bytes),
    homepageStatus: homepage.httpStatusCode,
    overrideCode,
  });
}
