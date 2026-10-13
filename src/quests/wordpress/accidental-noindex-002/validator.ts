import type { PlaygroundClient } from '@wp-playground/client';
import { inspectHtml, parseRobotsHeaders } from '../../html';
import { readHeaders } from '../../http';
import { implementationReview, observeOwnership, type OwnershipEvidence } from '../../review';
import type { ValidationCheck, ValidationResult } from '../../types';
import blueprint from './blueprint.json';

type Headers = Record<string, string[]>;
export interface NoindexObservation {
  targetHtml: string;
  targetStatus: number;
  targetHeaders?: Headers;
  controlHtml: string;
  controlStatus: number;
  controlHeaders?: Headers;
  publicHtml: string;
  publicStatus: number;
  publicHeaders?: Headers;
  ownership?: OwnershipEvidence;
}

function robotsEvidence(html: string, headers: Headers = {}) {
  const page = inspectHtml(html);
  const values = readHeaders(headers, 'x-robots-tag');
  const headerRobots = parseRobotsHeaders(values);
  const generic = [...page.genericRobots, ...parseRobotsHeaders(values, true)];
  return {
    hasHead: page.hasHead,
    noindex: [...page.robots, ...headerRobots].includes('noindex'),
    genericNoindex: generic.includes('noindex'),
    actual: `HTML: ${page.robots.join(', ') || '(none)'}；X-Robots-Tag: ${headerRobots.join(', ') || '(none)'}；通用规则: ${[...new Set(generic)].join(', ') || '(none)'}`,
  };
}

export function evaluateNoindex(observation: NoindexObservation): ValidationResult {
  const target = robotsEvidence(observation.targetHtml, observation.targetHeaders);
  const control = robotsEvidence(observation.controlHtml, observation.controlHeaders);
  const otherPublic = robotsEvidence(observation.publicHtml, observation.publicHeaders);
  const checks: ValidationCheck[] = [
    {
      id: 'http-status', name: '目标内容可以正常访问', group: 'target',
      passed: observation.targetStatus === 200, expected: '200', actual: String(observation.targetStatus),
    },
    {
      id: 'target-html', name: '目标返回完整的页面头部', group: 'target',
      passed: target.hasHead, expected: '真实 HTML head，不是空白或错误文本', actual: target.hasHead ? '存在 head' : '缺少 head',
    },
    {
      id: 'target-indexable', name: '目标不再含不收录指令', group: 'target',
      passed: !target.noindex, expected: 'HTML 与响应头均不含 noindex / none', actual: target.actual,
      details: '同时检查通用 robots、Googlebot 和 Bingbot；index 不会覆盖另一处的 noindex。本关不模拟实际收录或 robots.txt。',
    },
    {
      id: 'control-http-status', name: '不收录参考页仍正常返回 HTML', group: 'regression',
      passed: observation.controlStatus === 200 && control.hasHead, expected: 'HTTP 200，有 head',
      actual: `HTTP ${observation.controlStatus}；${control.hasHead ? '存在 head' : '缺少 head'}`,
    },
    {
      id: 'control-noindex-preserved', name: '参考页仍然保持 noindex', group: 'regression',
      passed: control.genericNoindex, expected: '/private-reference/ 保持通用 noindex，不只针对单一爬虫', actual: control.actual,
      details: '该对照页仍可公开访问，noindex 不是身份验证或保密机制。',
    },
    {
      id: 'public-page-preserved', name: '另一公开页的索引规则未被误伤', group: 'regression',
      passed: observation.publicStatus === 200 && otherPublic.hasHead && !otherPublic.noindex,
      expected: '/public-reference/ HTTP 200，有 head，无不收录指令',
      actual: `HTTP ${observation.publicStatus}；${otherPublic.hasHead ? '存在 head' : '缺少 head'}；${otherPublic.actual}`,
    },
  ];
  const targetPassed = checks.filter((check) => check.group === 'target').every((check) => check.passed);
  const passed = checks.every((check) => check.passed);
  return {
    passed, targetPassed, checks,
    details: passed ? 'PASS: target and both controls satisfy their indexing intent.' : targetPassed ? 'PARTIAL: target repaired but a control regressed.' : 'FAIL: target HTTP, HTML or robots evidence is incorrect.',
    review: passed ? implementationReview(observation.ownership) : undefined,
  };
}

export async function validate(client: PlaygroundClient): Promise<ValidationResult> {
  const target = await client.request({ url: '/field-notes/' });
  const control = await client.request({ url: '/private-reference/' });
  const publicPage = await client.request({ url: '/public-reference/' });
  const result = evaluateNoindex({
    targetHtml: new TextDecoder().decode(target.bytes), targetStatus: target.httpStatusCode, targetHeaders: target.headers,
    controlHtml: new TextDecoder().decode(control.bytes), controlStatus: control.httpStatusCode, controlHeaders: control.headers,
    publicHtml: new TextDecoder().decode(publicPage.bytes), publicStatus: publicPage.httpStatusCode, publicHeaders: publicPage.headers,
  });
  if (result.passed) result.review = implementationReview(await observeOwnership(
    client, blueprint, 'seo-lab-robots-rules/seo-lab-robots-rules.php',
    "!in_array('field-notes', apply_filters('seo_lab_robots_noindex_pages', ['field-notes', 'private-reference', 'future-page']), true) && in_array('private-reference', apply_filters('seo_lab_robots_noindex_pages', ['field-notes', 'private-reference', 'future-page']), true) && in_array('future-page', apply_filters('seo_lab_robots_noindex_pages', ['field-notes', 'private-reference', 'future-page']), true)",
  ));
  return result;
}
