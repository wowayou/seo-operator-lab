import type { QuestDefinition } from '../quests/types';
import type { AgentPolicy } from './harness';

/**
 * Loader for the held-out benchmark Quest set.
 *
 * `src/quests/heldout/` is gitignored: it is a checkout of a separate private
 * repository, so held-out fixtures and their reference repairs never enter this
 * repository's history. When the directory is absent both globs match nothing and
 * every export below is empty, so the public app and the test suite behave
 * exactly as they do today.
 *
 * This module is imported **only** by the agent harness entry, which Vite does
 * not include in the production build. `heldout-isolation.test.ts` enforces that:
 * if anything reachable from `src/main.ts` ever imports this file, held-out
 * fixtures would be compiled into the public bundle and the whole held-out set
 * would be burned.
 */

const questModules = import.meta.glob<{ default: QuestDefinition }>('../quests/heldout/*/index.ts', {
  eager: true,
});

/**
 * Reference repairs for held-out Quests.
 *
 * These live beside their Quest in the private checkout for the same reason the
 * Quest does: a reference repair *is* the answer. The public repository's
 * `policies.ts` may only contain repairs for the two open-book Quests.
 */
const policyModules = import.meta.glob<Record<string, AgentPolicy>>('../quests/heldout/*/policies.ts', {
  eager: true,
});

export const heldOutQuests: QuestDefinition[] = Object.values(questModules)
  .map((module) => module.default)
  .sort((left, right) => left.metadata.sequence - right.metadata.sequence);

const heldOutById = new Map(heldOutQuests.map((quest) => [quest.metadata.id, quest]));

if (heldOutById.size !== heldOutQuests.length) {
  throw new Error('Held-out Quest ids must be unique');
}

export const heldOutQuestIds: ReadonlySet<string> = new Set(heldOutById.keys());

export function getHeldOutQuest(id: string): QuestDefinition | undefined {
  return heldOutById.get(id);
}

export function isHeldOut(questId: string): boolean {
  return heldOutById.has(questId);
}

/**
 * Held-out reference policies, keyed by their exported name.
 *
 * Names must be unique across the held-out set; a collision is a private-repo
 * authoring error and is reported here rather than silently overwritten.
 */
export const heldOutPolicies: Record<string, AgentPolicy> = (() => {
  const merged: Record<string, AgentPolicy> = {};
  for (const [path, module] of Object.entries(policyModules)) {
    for (const [name, policy] of Object.entries(module)) {
      if (typeof policy !== 'function') continue;
      if (merged[name]) throw new Error(`Duplicate held-out policy name "${name}" from ${path}`);
      merged[name] = policy;
    }
  }
  return merged;
})();
