import type { PlaygroundClient } from '@wp-playground/client';
import { parseRobotsDirectives } from '../../html';
import type { ValidationCheck, ValidationResult } from '../../types';

export interface NoindexObservation {
  targetHtml: string;
  targetStatus: number;
  controlHtml: string;
  controlStatus: number;
}

function formatDirectives(directives: string[]): string {
  return directives.length ? directives.join(', ') : '(none)';
}

export function evaluateNoindex(observation: NoindexObservation): ValidationResult {
  const targetRobots = parseRobotsDirectives(observation.targetHtml);
  const controlRobots = parseRobotsDirectives(observation.controlHtml);
  const checks: ValidationCheck[] = [
    {
      id: 'http-status',
      name: '目标内容可以正常访问',
      group: 'target',
      passed: observation.targetStatus === 200,
      expected: '200',
      actual: String(observation.targetStatus),
    },
    {
      id: 'target-indexable',
      name: '目标内容不再包含 noindex',
      group: 'target',
      passed: !targetRobots.includes('noindex'),
      expected: 'robots 不含 noindex',
      actual: formatDirectives(targetRobots),
    },
    {
      id: 'control-http-status',
      name: '私有参考页可以正常访问',
      group: 'regression',
      passed: observation.controlStatus === 200,
      expected: '200',
      actual: String(observation.controlStatus),
    },
    {
      id: 'control-noindex-preserved',
      name: '私有参考页仍然保持 noindex',
      group: 'regression',
      passed: controlRobots.includes('noindex'),
      expected: 'robots 包含 noindex',
      actual: formatDirectives(controlRobots),
    },
  ];
  const targetPassed = checks.filter((check) => check.group === 'target').every((check) => check.passed);
  const passed = checks.every((check) => check.passed);
  return {
    passed,
    targetPassed,
    checks,
    details: passed
      ? 'PASS: the target is indexable and the intentional noindex control remains protected.'
      : targetPassed
        ? 'PARTIAL: the target is fixed, but the intentionally noindex control regressed.'
        : 'FAIL: the target article still contains noindex.',
    review: passed
      ? {
          level: 'lab',
          label: '回归完整',
          summary: '目标规则已收窄，刻意 noindex 的控制页没有被误伤。',
        }
      : undefined,
  };
}

export async function validate(client: PlaygroundClient): Promise<ValidationResult> {
  const target = await client.request({ url: '/field-notes/' });
  const control = await client.request({ url: '/private-reference/' });
  return evaluateNoindex({
    targetHtml: new TextDecoder().decode(target.bytes),
    targetStatus: target.httpStatusCode,
    controlHtml: new TextDecoder().decode(control.bytes),
    controlStatus: control.httpStatusCode,
  });
}
