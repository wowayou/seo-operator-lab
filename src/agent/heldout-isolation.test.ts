import { glob, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
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
  // Match Vite 6's default extension order, including lazy JSX/MJS modules.
  const extensions = ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'];
  const candidates = [base, ...extensions.map((extension) => `${base}${extension}`), ...extensions.map((extension) => path.join(base, `index${extension}`))];
  for (const candidate of candidates) {
    try {
      await readFile(candidate, 'utf8');
      if (/\.(?:[cm]?[jt]sx?|json)$/.test(candidate)) return await realpath(candidate);
    } catch {
      // Try the next candidate shape.
    }
  }
  return undefined;
}

/** Use the TypeScript syntax tree: comments and quoted examples are not imports. */
function visitSource(source: string, visit: (node: ts.Node) => void, fileName = 'module.ts'): void {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const walk = (node: ts.Node) => { visit(node); ts.forEachChild(node, walk); };
  walk(file);
}

function extractSpecifiers(source: string, fileName?: string): string[] {
  const result: string[] = [];
  visitSource(source, (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      result.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      const argument = node.arguments[0];
      if (!argument || !ts.isStringLiteralLike(argument)) throw new Error('Cannot audit a non-literal module import');
      result.push(argument.text);
    }
  }, fileName);
  return result;
}

function extractGlobPatterns(source: string, fileName?: string): string[] {
  const result: string[] = [];
  visitSource(source, (node) => {
    if (!ts.isCallExpression(node) || node.expression.getText() !== 'import.meta.glob') return;
    const first = node.arguments[0];
    const patterns = first && ts.isArrayLiteralExpression(first) ? first.elements : [first];
    for (const pattern of patterns) {
      if (!pattern || !ts.isStringLiteralLike(pattern)) throw new Error('Cannot audit a non-literal glob');
      result.push(pattern.text);
    }
  }, fileName);
  return result;
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

    for (const pattern of extractGlobPatterns(source, current)) {
      globs.push({ file: current, pattern });
      // A glob is an import edge, not just a string to inspect. Walk the actual
      // Quest modules and their lazy validators, otherwise leaks there are missed.
      for await (const match of glob(pattern, { cwd: path.dirname(current) })) {
        const resolved = await resolveModule(current, `./${match}`);
        if (resolved) queue.push(resolved);
      }
    }

    for (const specifier of extractSpecifiers(source, current)) {
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

  it('ignores comments and quoted import examples', () => {
    expect(extractSpecifiers("// import './secret';\nconst sample = \"import './example';\";")).toEqual([]);
  });

  it('audits literal glob arrays and rejects opaque expressions', () => {
    expect(extractGlobPatterns("import.meta.glob(['./x/*.ts', './y/*.ts'])")).toEqual(['./x/*.ts', './y/*.ts']);
    expect(() => extractGlobPatterns('import.meta.glob(pattern)')).toThrow('non-literal');
    expect(() => extractSpecifiers('import(destination)')).toThrow('non-literal');
  });

  it.each(['.ts', '.tsx', '.mjs'])('follows a deliberately injected leak behind a registry glob and lazy %s validator', async (extension) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'seo-lab-graph-'));
    try {
      await mkdir(path.join(directory, 'quests', 'one'), { recursive: true });
      await writeFile(path.join(directory, 'main.ts'), "import.meta.glob('./quests/*/index.ts');");
      await writeFile(path.join(directory, 'quests', 'one', 'index.ts'), "export const validate = () => import('./validator');");
      await writeFile(path.join(directory, 'quests', 'one', `validator${extension}`), extension === '.tsx'
        ? "const view = <button onClick={() => import('../../secret.json')}/>;"
        : "import '../../secret.json';");
      await writeFile(path.join(directory, 'secret.json'), '{}');
      const graph = await collectModuleGraph(path.join(directory, 'main.ts'));
      expect(graph.files).toContain(path.join(directory, 'secret.json'));
    } finally { await rm(directory, { recursive: true, force: true }); }
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
    expect([...graph.files].some((file) => file.startsWith(path.join(projectRoot, 'src', 'quests', 'heldout') + path.sep))).toBe(false);
    expect([...graph.files]).toContain(path.join(projectRoot, 'src', 'quests', 'wordpress', 'accidental-noindex-002', 'validator.ts'));
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
