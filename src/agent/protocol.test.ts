import { describe, expect, it } from 'vitest';
import canonicalQuest from '../quests/wordpress/canonical-duplicate-001';
import {
  assertAllowedPath,
  buildBrief,
  buildRunRecord,
  normalizeVfsPath,
  summarizeValidation,
  type ToolCallRecord,
  type ValidationRecord,
} from './protocol';
import type { ValidationResult } from '../quests/types';

const metadata = canonicalQuest.metadata;

function validation(overrides: Partial<ValidationRecord>): ValidationRecord {
  return { seq: 1, passed: false, targetPassed: false, failedCheckIds: [], ...overrides };
}

describe('buildBrief disclosure levels', () => {
  it('withholds the fault location at the minimal level', () => {
    const brief = buildBrief(metadata, 'minimal');
    expect(brief.editorFile).toBeUndefined();
    expect(brief.editorLocation).toBeUndefined();
    expect(brief.hints).toBeUndefined();
    expect(brief.targetUrl).toBe(metadata.target.url);
  });

  it('names the owning file at the guided level but still withholds hints', () => {
    const brief = buildBrief(metadata, 'guided');
    expect(brief.editorFile).toBe(metadata.editor.file);
    expect(brief.hints).toBeUndefined();
  });

  it('discloses ordered hints only at the hinted level', () => {
    const brief = buildBrief(metadata, 'hinted');
    expect(brief.hints).toHaveLength(3);
    expect(brief.hints?.[0]).toContain(metadata.hints[0].title);
  });

  it('never discloses the post-pass production solution', () => {
    const advanced = metadata.postPassReview.advancedChallenge?.instruction ?? '';
    expect(advanced.length).toBeGreaterThan(0);
    for (const level of ['minimal', 'guided', 'hinted'] as const) {
      expect(JSON.stringify(buildBrief(metadata, level))).not.toContain(advanced);
    }
  });
});

describe('filesystem confinement', () => {
  it('normalizes traversal segments', () => {
    expect(normalizeVfsPath('/wordpress/wp-content/../wp-config.php')).toBe('/wordpress/wp-config.php');
    expect(normalizeVfsPath('/wordpress//wp-content/./plugins')).toBe('/wordpress/wp-content/plugins');
  });

  it('rejects relative paths and escapes above the root', () => {
    expect(() => normalizeVfsPath('wordpress/wp-config.php')).toThrow(/absolute/);
    expect(() => normalizeVfsPath('/../etc/passwd')).toThrow(/escapes/);
  });

  it('rejects paths that resolve outside the WordPress tree', () => {
    expect(() => assertAllowedPath('/etc/passwd')).toThrow(/outside/);
    expect(() => assertAllowedPath('/wordpress/../tmp/x')).toThrow(/outside/);
    expect(() => assertAllowedPath('/wordpress-other/x')).toThrow(/outside/);
  });

  it('accepts the root and paths beneath it', () => {
    expect(assertAllowedPath('/wordpress')).toBe('/wordpress');
    expect(assertAllowedPath('/wordpress/wp-content/plugins/a.php')).toBe('/wordpress/wp-content/plugins/a.php');
  });
});

describe('run records', () => {
  const result: ValidationResult = {
    passed: false,
    targetPassed: true,
    checks: [
      { id: 'canonical-count', name: '', group: 'target', passed: true, expected: '1', actual: '1' },
      { id: 'product-schema-preserved', name: '', group: 'regression', passed: false, expected: '1', actual: '0' },
    ],
    details: '',
  };

  it('summarizes only failed check ids', () => {
    expect(summarizeValidation(result, 7)).toEqual({
      seq: 7,
      passed: false,
      targetPassed: true,
      failedCheckIds: ['product-schema-preserved'],
      reviewLevel: undefined,
    });
  });

  it('counts a symptom-fixed-but-regressed validation as a regression', () => {
    const record = buildRunRecord({
      questId: metadata.id,
      agent: 'test',
      disclosure: 'guided',
      startedAt: '2026-08-24T00:00:00.000Z',
      durationMs: 10,
      toolCalls: [],
      validations: [validation({ targetPassed: true, failedCheckIds: ['product-schema-preserved'] })],
    });
    expect(record.regressionsIntroduced).toBe(1);
    expect(record.outcome).toBe('fail');
  });

  it('takes the outcome from the final validation', () => {
    const record = buildRunRecord({
      questId: metadata.id,
      agent: 'test',
      disclosure: 'guided',
      startedAt: '2026-08-24T00:00:00.000Z',
      durationMs: 10,
      toolCalls: [],
      validations: [
        validation({ seq: 1, targetPassed: true }),
        validation({ seq: 2, passed: true, targetPassed: true, reviewLevel: 'production' }),
      ],
    });
    expect(record.outcome).toBe('pass');
    expect(record.reviewLevel).toBe('production');
    expect(record.regressionsIntroduced).toBe(1);
  });

  it('reports a crashed policy as an error outcome even after a passing validation', () => {
    const record = buildRunRecord({
      questId: metadata.id,
      agent: 'test',
      disclosure: 'guided',
      startedAt: '2026-08-24T00:00:00.000Z',
      durationMs: 10,
      toolCalls: [{ seq: 1, tool: 'readFile', argument: '/wordpress', ok: true } satisfies ToolCallRecord],
      validations: [validation({ passed: true, targetPassed: true })],
      error: 'tool limit exceeded',
    });
    expect(record.outcome).toBe('error');
    expect(record.toolCallCount).toBe(1);
  });

  it('reports a run with no validation as a failure, not a pass', () => {
    const record = buildRunRecord({
      questId: metadata.id,
      agent: 'test',
      disclosure: 'minimal',
      startedAt: '2026-08-24T00:00:00.000Z',
      durationMs: 10,
      toolCalls: [],
      validations: [],
    });
    expect(record.outcome).toBe('fail');
    expect(record.validationCount).toBe(0);
  });
});
