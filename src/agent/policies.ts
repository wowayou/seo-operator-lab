import type { AgentPolicy, AgentSession } from './harness';

/**
 * Deterministic reference policies used to calibrate the harness.
 *
 * These are not agents under test. They are fixtures that prove the harness can
 * tell three outcomes apart: a narrow repair, a repair that satisfies the
 * symptom while breaking a regression, and an upgrade-safe production repair.
 * A real agent run is only meaningful if these three produce different records.
 */

const PRODUCT_SUITE = '/wordpress/wp-content/plugins/seo-lab-product-suite/seo-lab-product-suite.php';
const SITE_OVERRIDES = '/wordpress/wp-content/plugins/seo-lab-site-overrides/seo-lab-site-overrides.php';
const ROBOTS_RULES = '/wordpress/wp-content/plugins/seo-lab-robots-rules/seo-lab-robots-rules.php';

/** Fails loudly rather than silently writing an unchanged file. */
function replaceOnce(source: string, find: string, replaceWith: string, label: string): string {
  if (!source.includes(find)) throw new Error(`Reference policy could not find ${label}`);
  return source.replace(find, replaceWith);
}

/**
 * Canonical Quest, lab-grade repair: unhook the duplicate canonical in the
 * vendor plugin. Target and regression checks both pass; the review should
 * report `lab` because the vendor file was edited directly.
 */
export const canonicalLabRepair: AgentPolicy = async (session: AgentSession) => {
  const source = await session.tools.readFile(PRODUCT_SUITE);
  await session.tools.writeFile(
    PRODUCT_SUITE,
    replaceOnce(
      source,
      "add_action('wp_head', 'seo_lab_product_suite_duplicate_canonical', 20);\n",
      '',
      'the duplicate canonical hook registration',
    ),
  );
  await session.validate();
};

/**
 * Canonical Quest, production repair: remove the vendor hook from the
 * site-owned override plugin, leaving vendor code untouched.
 */
export const canonicalProductionRepair: AgentPolicy = async (session: AgentSession) => {
  const source = await session.tools.readFile(SITE_OVERRIDES);
  await session.tools.writeFile(
    SITE_OVERRIDES,
    replaceOnce(
      source,
      '    // Add site-owned hook overrides here.',
      "    remove_action('wp_head', 'seo_lab_product_suite_duplicate_canonical', 20);",
      'the site override placeholder',
    ),
  );
  await session.validate();
};

/**
 * Canonical Quest, overbroad repair: neutralize the whole vendor plugin. The
 * duplicate canonical disappears, so a symptom-only check would call this a
 * pass; the Product Schema regression check is what catches it.
 */
export const canonicalOverbroadRepair: AgentPolicy = async (session: AgentSession) => {
  await session.tools.readFile(PRODUCT_SUITE);
  await session.tools.writeFile(
    PRODUCT_SUITE,
    "<?php\n/**\n * Plugin Name: SEO Lab - Product Suite\n */\n// Disabled wholesale by an overbroad repair.\n",
  );
  await session.validate();
};

/**
 * Noindex Quest, narrow repair: keep the intentional control page noindex and
 * drop only the target page from the condition.
 */
export const noindexNarrowRepair: AgentPolicy = async (session: AgentSession) => {
  const source = await session.tools.readFile(ROBOTS_RULES);
  await session.tools.writeFile(
    ROBOTS_RULES,
    replaceOnce(
      source,
      "['field-notes', 'private-reference']",
      "['private-reference']",
      'the combined noindex list',
    ),
  );
  await session.validate();
};

/** Keep the vendor source and future exclusions intact through its stable filter. */
export const noindexProductionRepair: AgentPolicy = async (session: AgentSession) => {
  const source = await session.tools.readFile(SITE_OVERRIDES);
  await session.tools.writeFile(
    SITE_OVERRIDES,
    replaceOnce(
      source,
      '    // Add site-owned hook overrides here.',
      "    add_filter('seo_lab_robots_noindex_pages', function (array $pages): array {\n        return array_values(array_diff($pages, ['field-notes']));\n    });",
      'the site override placeholder',
    ),
  );
  await session.validate();
};

/**
 * Noindex Quest, overbroad repair: remove every noindex rule. The target
 * becomes indexable but the intentionally excluded control page regresses.
 */
export const noindexOverbroadRepair: AgentPolicy = async (session: AgentSession) => {
  const source = await session.tools.readFile(ROBOTS_RULES);
  await session.tools.writeFile(
    ROBOTS_RULES,
    replaceOnce(
      source,
      "add_action('wp_head', 'seo_lab_robots_rules_output', 20);\n",
      '',
      'the robots rule hook registration',
    ),
  );
  await session.validate();
};

/** Establishes the pre-repair baseline: observe only, change nothing. */
export const observeOnly: AgentPolicy = async (session: AgentSession) => {
  await session.tools.fetchUrl(session.brief.targetUrl);
  await session.validate();
};

/** Confirms the harness confines the agent to the WordPress tree. */
export const escapeAttempt: AgentPolicy = async (session: AgentSession) => {
  await session.tools.readFile('/etc/passwd');
};

export const referencePolicies = {
  observeOnly,
  canonicalLabRepair,
  canonicalProductionRepair,
  canonicalOverbroadRepair,
  noindexNarrowRepair,
  noindexProductionRepair,
  noindexOverbroadRepair,
  escapeAttempt,
} satisfies Record<string, AgentPolicy>;

export type ReferencePolicyName = keyof typeof referencePolicies;
