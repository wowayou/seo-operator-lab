import { cp, mkdtemp, readFile, rm, symlink, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const project = path.resolve(import.meta.dirname, '../..');
const slug = 'accidental-noindex-002';
let root: string;
function run(script: string, args: string[] = []) {
  return spawnSync(process.execPath, [path.join(root, 'scripts', script), ...args], { cwd: root, encoding: 'utf8', timeout: 20_000 });
}
async function change(file: string, edit: (value: any) => void) {
  const location = path.join(root, 'src/quests/wordpress', slug, file);
  const value = JSON.parse(await readFile(location, 'utf8'));
  edit(value);
  await writeFile(location, JSON.stringify(value));
}

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'seo-lab-authoring-'));
  await mkdir(path.join(root, 'scripts'));
  await mkdir(path.join(root, 'schemas'));
  await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await symlink(path.join(project, 'node_modules'), path.join(root, 'node_modules'), 'junction');
  for (const file of ['validate-quests.mjs', 'create-quest.mjs']) await cp(path.join(project, 'scripts', file), path.join(root, 'scripts', file));
  await cp(path.join(project, 'schemas/quest.schema.json'), path.join(root, 'schemas/quest.schema.json'));
});
beforeEach(async () => {
  for (const name of ['canonical-duplicate-001', slug]) {
    await cp(path.join(project, 'src/quests/wordpress', name), path.join(root, 'src/quests/wordpress', name), { recursive: true });
  }
});
afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });

describe('Quest authoring CLI contract', () => {
  it('accepts the real formal fixtures', () => {
    const result = run('validate-quests.mjs');
    expect(result.status, result.stderr).toBe(0);
  });
  it('rejects a walkthrough that no longer matches the editor source', async () => {
    await change('quest.json', (quest) => { quest.walkthrough.before = 'a nonexistent source statement'; });
    const result = run('validate-quests.mjs');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('walkthrough.before');
  });
  it('rejects repeated hint levels instead of silently revealing the wrong progression', async () => {
    await change('quest.json', (quest) => { quest.hints[1].level = 1; });
    const result = run('validate-quests.mjs');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ordered levels');
  });
  it('rejects runtime versions that disagree with the displayed pins', async () => {
    await change('blueprint.json', (blueprint) => { blueprint.preferredVersions.php = '8.2'; });
    const result = run('validate-quests.mjs');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('versions must match');
  });
  it('creates an excluded draft and refuses to overwrite it on a second invocation', async () => {
    const first = run('create-quest.mjs', ['new-example', 'New Example']);
    expect(first.status, first.stderr).toBe(0);
    const draft = path.join(root, 'src/quests/wordpress/_drafts/new-example-003/quest.json');
    const original = await readFile(draft, 'utf8');
    expect(JSON.parse(original)).toHaveProperty('walkthrough');
    const second = run('create-quest.mjs', ['new-example', 'Replacement']);
    expect(second.status).not.toBe(0);
    expect(await readFile(draft, 'utf8')).toBe(original);
    expect(run('validate-quests.mjs').status).toBe(0);
  });
});
