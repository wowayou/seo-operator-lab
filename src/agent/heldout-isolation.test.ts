import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the one invariant the held-out Quest set depends on.
 *
 * A held-out Quest is only unseen while it stays out of the deployed bundle.
 * Vite reaches the public bundle by following imports from `src/main.ts`, so if
 * anything on that graph ever imports the held-out loader, the private fixtures
 * and their reference repairs are compiled into a file every visitor can read --
 * and the entire held-out set is burned in one deploy.
 *
 * The check walks the real import graph rather than asserting on a single file,
 * because the dangerous case is indirect: a helper added to `src/quests/` that
 * innocently re-exports the loader would leak just as effectively.
 */

const projectRoot = path.resolve(import.meta.dirname, '..', '..');
const HELD_OUT_LOADER = path.join(projectRoot, 'src', 'agent', 'heldout.ts');

/** Resolves a relative specifier the way the bundler would, trying real extensions. */
async function resolveModule(fromFile: string, specifier: string): Promise<string | undefined> {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.js`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.js'),
  ];
  for (const candidate of candidates) {
    try {
      const stat = await readFile(candidate, 'utf8').then(() => candidate);
      if (stat.endsWith('.ts') || stat.endsWith('.js')) return stat;
    } catch {
      // Try the next candidate shape.
    }
  }
  return undefined;
}

/**
 * Extracts every module specifier from one source file.
 *
 * Each pattern is anchored on the specifier itself and never spans lines. An
 * earlier version matched `import ... from '...'` with a lazy `[\s\S]*?`, which
 * silently missed bare side-effect imports (`import './x';` has no `from`) and
 * could skip intervening imports by matching a distant `from`. A leak-detection
 * test that misses an import shape is worse than no test, so the shapes are
 * enumerated explicitly and covered by the self-check below.
 */
function extractSpecifiers(source: string): string[] {
  return [
    // `import x from 'y'`, `import type {a} from 'y'`, `export {a} from 'y'`, `export * from 'y'`
    ...source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g),
    // `import 'y'` -- side-effect only, no bindings
    ...source.matchAll(/\bimport\s+['"]([^'"]+)['"]/g),
    // `import('y')`
    ...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
    // `require('y')`
    ...source.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
  ].map((match) => match[1]);
}

/** Extracts `import.meta.glob('pattern')` patterns, which pull in files by shape. */
function extractGlobPatterns(source: string): string[] {
  return [...source.matchAll(/import\.meta\.glob\s*(?:<[^>]*>)?\s*\(\s*['"]([^'"]+)['"]/g)].map(
    (match) => match[1],
  );
}

interface ModuleGraph {
  files: Set<string>;
  /** Every glob pattern found anywhere on the graph, with its owning file. */
  globs: { file: string; pattern: string }[];
}

/**
 * Collects every local module reachable from an entry point.
 *
 * Bare specifiers (npm packages) are ignored: they cannot reach the gitignored
 * held-out directory. Glob patterns are collected too, because a glob on the
 * public graph could sweep in held-out files without any explicit import.
 */
async function collectModuleGraph(entry: string): Promise<ModuleGraph> {
  const files = new Set<string>();
  const globs: { file: string; pattern: string }[] = [];
  const queue = [entry];

  while (queue.length) {
    const current = queue.pop()!;
    if (files.has(current)) continue;
    files.add(current);

    let source: string;
    try {
      source = await readFile(current, 'utf8');
    } catch {
      continue;
    }

    for (const pattern of extractGlobPatterns(source)) globs.push({ file: current, pattern });

    for (const specifier of extractSpecifiers(source)) {
      if (!specifier.startsWith('.')) continue;
      const resolved = await resolveModule(current, specifier);
      if (resolved) queue.push(resolved);
    }
  }

  return { files, globs };
}

/**
 * Self-check for the extractor itself.
 *
 * These cases are the reason this block exists: an earlier extractor passed every
 * assertion below it while silently ignoring side-effect imports, so a real leak
 * would not have been caught. If the extractor is ever simplified again, these
 * fail first and name the shape that was dropped.
 */
describe('import extractor', () => {
  it.each([
    ['default import', "import x from './a';", './a'],
    ['named import', "import { x } from './a';", './a'],
    ['type-only import', "import type { X } from './a';", './a'],
    ['side-effect import', "import './a';", './a'],
    ['re-export', "export { x } from './a';", './a'],
    ['star re-export', "export * from './a';", './a'],
    ['dynamic import', "const m = await import('./a');", './a'],
    ['require', "const m = require('./a');", './a'],
  ])('finds the specifier in a %s', (_label, source, expected) => {
    expect(extractSpecifiers(source)).toContain(expected);
  });

  it('finds every specifier when several imports appear in sequence', () => {
    const source = ["import './side-effect';", "import a from './a';", "import type { B } from './b';"].join('\n');
    expect(extractSpecifiers(source)).toEqual(
      expect.arrayContaining(['./side-effect', './a', './b']),
    );
  });

  it('finds glob patterns with and without a type parameter', () => {
    expect(extractGlobPatterns("import.meta.glob('./x/*.ts')")).toEqual(['./x/*.ts']);
    expect(extractGlobPatterns("import.meta.glob<{ default: T }>('./y/*/index.ts', { eager: true })")).toEqual([
      './y/*/index.ts',
    ]);
  });
});

describe('held-out Quest isolation', () => {
  it('is not reachable from the public application entry', async () => {
    const graph = await collectModuleGraph(path.join(projectRoot, 'src', 'main.ts'));
    expect([...graph.files]).not.toContain(HELD_OUT_LOADER);
  });

  it('is reachable from the agent harness entry, which is not built', async () => {
    const graph = await collectModuleGraph(path.join(projectRoot, 'src', 'agent', 'run.ts'));
    expect([...graph.files]).toContain(HELD_OUT_LOADER);
  });

  /**
   * A glob is a second, importless way to reach held-out files: a `**` pattern
   * rooted at `src/quests/` would match `heldout/` without anyone importing it.
   */
  it('has no glob on the public graph that could sweep in held-out files', async () => {
    const graph = await collectModuleGraph(path.join(projectRoot, 'src', 'main.ts'));
    expect(graph.globs.length).toBeGreaterThan(0);
    for (const { file, pattern } of graph.globs) {
      expect(pattern, `${file} globs into the held-out directory`).not.toContain('heldout');
      expect(pattern, `${file} uses a ** glob that could match held-out files`).not.toContain('**');
    }
  });

  it('gitignores the held-out checkout so fixtures cannot be committed here', async () => {
    const ignored = await readFile(path.join(projectRoot, '.gitignore'), 'utf8');
    expect(ignored).toMatch(/^src\/quests\/heldout\/$/m);
  });

  it('keeps held-out reference repairs out of the public policy module', async () => {
    const policies = await readFile(path.join(projectRoot, 'src', 'agent', 'policies.ts'), 'utf8');
    expect(policies).not.toContain('heldout');
  });
});
