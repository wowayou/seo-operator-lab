import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

globalThis.location ??= new URL('http://localhost/');
const { validateBlueprint } = await import('@wp-playground/client');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const questsRoot = path.join(root, 'src', 'quests', 'wordpress');
const schema = JSON.parse(await readFile(path.join(root, 'schemas', 'quest.schema.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true });
const validateMetadata = ajv.compile(schema);
const entries = (await readdir(questsRoot, { withFileTypes: true })).filter(
  (entry) => entry.isDirectory() && !entry.name.startsWith('_'),
);
const ids = new Set();
const sequences = new Set();
const requiredFiles = ['quest.json', 'blueprint.json', 'index.ts', 'validator.ts'];
const failures = [];

for (const entry of entries) {
  const directory = path.join(questsRoot, entry.name);
  const files = new Set(await readdir(directory));
  for (const requiredFile of requiredFiles) {
    if (!files.has(requiredFile)) failures.push(`${entry.name}: missing ${requiredFile}`);
  }
  if (!files.has('quest.json') || !files.has('blueprint.json')) continue;

  const metadata = JSON.parse(await readFile(path.join(directory, 'quest.json'), 'utf8'));
  if (!validateMetadata(metadata)) {
    failures.push(`${entry.name}/quest.json: ${ajv.errorsText(validateMetadata.errors, { separator: '; ' })}`);
  }
  if (ids.has(metadata.id)) failures.push(`${entry.name}: duplicate Quest id ${metadata.id}`);
  if (sequences.has(metadata.sequence)) failures.push(`${entry.name}: duplicate sequence ${metadata.sequence}`);
  ids.add(metadata.id);
  sequences.add(metadata.sequence);

  const blueprint = JSON.parse(await readFile(path.join(directory, 'blueprint.json'), 'utf8'));
  const blueprintResult = validateBlueprint(blueprint);
  if (!blueprintResult.valid) {
    failures.push(`${entry.name}/blueprint.json: ${JSON.stringify(blueprintResult.errors)}`);
  }
  if (blueprint.landingPage !== metadata.target.url) {
    failures.push(`${entry.name}: blueprint landingPage must equal quest target.url`);
  }
}

if (entries.length === 0) failures.push('No Quest directories found');

if (failures.length) {
  console.error(`Quest validation failed:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`Quest validation passed: ${entries.length} Quest directories`);
}
