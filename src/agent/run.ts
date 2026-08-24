import { getQuest } from '../quests/registry';
import { runAgentQuest } from './harness';
import { getHeldOutQuest, heldOutPolicies, heldOutQuestIds, isHeldOut } from './heldout';
import { referencePolicies, type ReferencePolicyName } from './policies';
import type { AgentRunRecord, DisclosureLevel } from './protocol';

/**
 * Browser entry point for one benchmark run.
 *
 * This page is intentionally not part of the production build: Vite only bundles
 * the root `index.html`, so the harness is reachable from the dev server and the
 * Playwright matrix but never published to the public site. Keeping it unbuilt
 * also keeps the reference policies -- which contain the exact repairs -- out of
 * the deployed artifact.
 */

declare global {
  interface Window {
    /**
     * Awaited by the Playwright driver.
     *
     * `policy` is a plain string rather than `ReferencePolicyName` because a
     * held-out Quest brings its own reference policies from the private checkout,
     * and their names are unknown to this repository at compile time.
     */
    agentRun?: (options: {
      questId: string;
      policy: string;
      disclosure?: DisclosureLevel;
    }) => Promise<AgentRunRecord>;
    agentRunReady?: boolean;
    /**
     * Lets the driver discover which held-out Quests are present without
     * hardcoding ids that only exist in the private checkout.
     */
    agentHeldOutQuestIds?: string[];
  }
}

const iframe = document.querySelector<HTMLIFrameElement>('#agent-runtime');
const statusElement = document.querySelector<HTMLElement>('#agent-status');
const outputElement = document.querySelector<HTMLElement>('#agent-output');

if (!iframe || !statusElement || !outputElement) {
  throw new Error('The agent runner page is missing required elements');
}

function setStatus(message: string, state: 'booting' | 'running' | 'done' | 'error'): void {
  statusElement!.textContent = message;
  statusElement!.dataset.state = state;
}

/**
 * Boots a fresh runtime for every run.
 *
 * A benchmark run must start from the authored fixture, so the iframe is
 * replaced rather than reused -- the same reason the human UI rebuilds on Reset
 * (see ADR-003: the pinned client exposes no lifecycle destroy method).
 */
async function bootFreshRuntime(blueprint: unknown) {
  const { startPlaygroundWeb } = await import('@wp-playground/client');
  const replacement = iframe!.cloneNode(false) as HTMLIFrameElement;
  iframe!.replaceWith(replacement);
  const target = document.querySelector<HTMLIFrameElement>('#agent-runtime');
  if (!target) throw new Error('The runtime iframe could not be replaced');
  return startPlaygroundWeb({
    iframe: target,
    remoteUrl: 'https://playground.wordpress.net/remote.html',
    blueprint: blueprint as Parameters<typeof startPlaygroundWeb>[0]['blueprint'],
  });
}

window.agentRun = async ({ questId, policy, disclosure = 'guided' }) => {
  /**
   * Held-out Quests are resolved first. They live outside the public registry, so
   * `getQuest()` cannot see them and would silently fall back to the first public
   * Quest -- which would attribute a held-out run to an open-book fixture.
   */
  const heldOutQuest = getHeldOutQuest(questId);
  const quest = heldOutQuest ?? getQuest(questId);
  if (quest.metadata.id !== questId) throw new Error(`Unknown Quest id: ${questId}`);

  const selectedPolicy = referencePolicies[policy as ReferencePolicyName] ?? heldOutPolicies[policy];
  if (!selectedPolicy) throw new Error(`Unknown reference policy: ${policy}`);

  setStatus(`Booting ${quest.metadata.id}`, 'booting');
  const client = await bootFreshRuntime(quest.blueprint);

  setStatus(`Running ${policy} against ${quest.metadata.id}`, 'running');
  const record = await runAgentQuest({
    client,
    quest,
    agent: `reference:${policy}`,
    policy: selectedPolicy,
    disclosure,
    heldOut: isHeldOut(questId),
  });

  outputElement!.textContent = JSON.stringify(record, null, 2);
  setStatus(`${record.outcome.toUpperCase()} in ${record.durationMs}ms`, record.outcome === 'error' ? 'error' : 'done');
  return record;
};

window.agentHeldOutQuestIds = [...heldOutQuestIds];
window.agentRunReady = true;
setStatus(
  heldOutQuestIds.size ? `Ready (${heldOutQuestIds.size} held-out Quest(s) loaded)` : 'Ready (open-book Quests only)',
  'done',
);
