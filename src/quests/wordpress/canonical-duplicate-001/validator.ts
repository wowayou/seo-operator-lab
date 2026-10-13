import type { PlaygroundClient } from '@wp-playground/client';
import { inspectHtml } from '../../html';
import { implementationReview, observeOwnership, type OwnershipEvidence } from '../../review';
import type { ValidationCheck, ValidationResult } from '../../types';
import blueprint from './blueprint.json';

export interface CanonicalObservation {
  targetHtml: string;
  targetStatus: number;
  expectedCanonical: string;
  homepageHtml: string;
  homepageStatus: number;
  expectedHomepageCanonical: string;
  ownership?: OwnershipEvidence;
}

export function evaluateCanonical(observation: CanonicalObservation): ValidationResult {
  const target = inspectHtml(observation.targetHtml);
  const homepage = inspectHtml(observation.homepageHtml);
  const checks: ValidationCheck[] = [
    {
      id: 'http-status', name: '目标页面可以正常访问', group: 'target',
      passed: observation.targetStatus === 200, expected: '200', actual: String(observation.targetStatus),
    },
    {
      id: 'target-html', name: '目标返回完整的页面头部', group: 'target',
      passed: target.hasHead, expected: '真实 HTML head，不是空白或错误文本', actual: target.hasHead ? '存在 head' : '缺少 head',
    },
    {
      id: 'canonical-count', name: '目标页面只有一个 canonical', group: 'target',
      passed: target.canonicals.length === 1, expected: '1', actual: String(target.canonicals.length),
    },
    {
      id: 'canonical-url', name: 'canonical 指向目标页面', group: 'target',
      passed: target.canonicals.length === 1 && target.canonicals[0] === observation.expectedCanonical,
      expected: observation.expectedCanonical, actual: target.canonicals.length ? target.canonicals.join(', ') : '(none)',
    },
    {
      id: 'product-schema-preserved', name: '有效的产品结构化数据仍然存在', group: 'regression',
      passed: target.productCount === 1, expected: '1 个有效 Product JSON-LD（含 schema.org 上下文和非空 name）', actual: `${target.productCount} 个`,
      details: 'JSON-LD 是机器可读的结构化数据。标记存在但 JSON 损坏、类型错误或名称为空，都不能视为保留。此处不是完整富媒体结果资格检测。',
    },
    {
      id: 'homepage-canonical-stable', name: '首页 canonical 未受影响', group: 'regression',
      passed: observation.homepageStatus === 200 && homepage.hasHead && homepage.canonicals.length === 1 && homepage.canonicals[0] === observation.expectedHomepageCanonical,
      expected: `HTTP 200；一个 canonical，指向 ${observation.expectedHomepageCanonical}`,
      actual: `HTTP ${observation.homepageStatus}；${homepage.hasHead ? 'head 正常' : '缺少 head'}；${homepage.canonicals.length ? homepage.canonicals.join(', ') : '(none)'}`,
    },
  ];
  const targetPassed = checks.filter((check) => check.group === 'target').every((check) => check.passed);
  const passed = checks.every((check) => check.passed);
  return {
    passed, targetPassed, checks,
    details: passed ? 'PASS: target and regression evidence match.' : targetPassed ? 'PARTIAL: target repaired but a regression remains.' : 'FAIL: target HTTP, HTML or canonical evidence is incorrect.',
    review: passed ? implementationReview(observation.ownership) : undefined,
  };
}

export async function validate(client: PlaygroundClient): Promise<ValidationResult> {
  const response = await client.run({ code: `<?php
    require_once '/wordpress/wp-load.php';
    echo wp_json_encode([
      'target' => home_url('/sample-product/'),
      'homepage' => get_permalink((int) get_option('page_on_front')),
    ]);
  ` });
  const urls = JSON.parse(new TextDecoder().decode(response.bytes)) as Record<string, unknown>;
  if (typeof urls.target !== 'string' || typeof urls.homepage !== 'string' || !URL.canParse(urls.target) || !URL.canParse(urls.homepage)) {
    throw new Error('WordPress returned invalid canonical URLs');
  }
  // Keep requests sequential: the PHP runtime is a single mutable environment.
  const target = await client.request({ url: '/sample-product/' });
  const homepage = await client.request({ url: urls.homepage });
  const observation: CanonicalObservation = {
    targetHtml: new TextDecoder().decode(target.bytes), targetStatus: target.httpStatusCode,
    expectedCanonical: urls.target,
    homepageHtml: new TextDecoder().decode(homepage.bytes), homepageStatus: homepage.httpStatusCode,
    expectedHomepageCanonical: urls.homepage,
  };
  const result = evaluateCanonical(observation);
  if (result.passed) result.review = implementationReview(await observeOwnership(
    client, blueprint, 'seo-lab-product-suite/seo-lab-product-suite.php',
    "false === has_action('wp_head', 'seo_lab_product_suite_duplicate_canonical')",
  ));
  return result;
}
