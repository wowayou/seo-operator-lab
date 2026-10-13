import type { PlaygroundClient } from '@wp-playground/client';
import type { ImplementationReview } from './types';

const OVERRIDE_FILE = 'seo-lab-site-overrides/seo-lab-site-overrides.php';

export interface OwnershipEvidence {
  vendorUnchanged: boolean;
  overrideActive: boolean;
  overrideChanged: boolean;
  ruleEffective: boolean;
}

export function implementationReview(evidence?: OwnershipEvidence): ImplementationReview {
  const production = Boolean(evidence?.vendorUnchanged && evidence.overrideActive && evidence.overrideChanged && evidence.ruleEffective);
  return production ? {
    level: 'production',
    label: '站点自有修复',
    summary: '本关供应方文件与初始版本一致，站点自有覆盖插件已启用且规则实际生效。这是可维护路径的实验验证，不是完整生产安全认证。',
  } : {
    level: 'lab',
    label: '实验修复',
    summary: '目标与回归都正确，但尚未证实站点自有的升级安全路径。直接改供应方插件可能被更新覆盖；可继续下方生产级改进。',
  };
}

interface Fixture {
  steps: Array<{ step: string; path?: string; data?: unknown }>;
}

export function fixtureFile(fixture: Fixture, file: string): string {
  const data = fixture.steps.find((step) => step.step === 'writeFile' && step.path === `/wordpress/wp-content/plugins/${file}`)?.data;
  if (typeof data !== 'string' || !data) throw new Error(`Missing baseline plugin: ${file}`);
  return data;
}

/** All PHP and file paths are authored constants, not learner-supplied inputs. */
export async function observeOwnership(client: PlaygroundClient, fixture: Fixture, vendorFile: string, ruleProbe: string): Promise<OwnershipEvidence> {
  if (!/^[a-z0-9-]+\/[a-z0-9-]+\.php$/.test(vendorFile)) throw new Error('Invalid plugin path');
  const response = await client.run({ code: `<?php
    require_once '/wordpress/wp-load.php';
    require_once '/wordpress/wp-admin/includes/plugin.php';
    $vendor = '/wordpress/wp-content/plugins/${vendorFile}';
    $override = '/wordpress/wp-content/plugins/${OVERRIDE_FILE}';
    echo wp_json_encode([
      'vendor' => is_file($vendor) ? file_get_contents($vendor) : '',
      'override' => is_file($override) ? file_get_contents($override) : '',
      'active' => is_plugin_active('${OVERRIDE_FILE}'),
      'effective' => (bool) (${ruleProbe}),
    ]);
  ` });
  const facts = JSON.parse(new TextDecoder().decode(response.bytes)) as Record<string, unknown>;
  if (typeof facts.vendor !== 'string' || typeof facts.override !== 'string' || typeof facts.active !== 'boolean' || typeof facts.effective !== 'boolean') {
    throw new Error('Invalid implementation review evidence');
  }
  return {
    vendorUnchanged: facts.vendor === fixtureFile(fixture, vendorFile),
    overrideActive: facts.active,
    overrideChanged: Boolean(facts.override) && facts.override !== fixtureFile(fixture, OVERRIDE_FILE),
    ruleEffective: facts.effective,
  };
}
