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
const entries = (await readdir(questsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'));
const ids = new Set(), sequences = new Set(), failures = [];

for (const entry of entries) {
  const directory = path.join(questsRoot, entry.name);
  const files = new Set(await readdir(directory));
  for (const file of ['quest.json', 'blueprint.json', 'index.ts', 'validator.ts']) {
    if (!files.has(file)) failures.push(`${entry.name}: missing ${file}`);
  }
  let metadata, blueprint;
  try {
    metadata = JSON.parse(await readFile(path.join(directory, 'quest.json'), 'utf8'));
    blueprint = JSON.parse(await readFile(path.join(directory, 'blueprint.json'), 'utf8'));
  } catch (error) {
    failures.push(`${entry.name}: ${error.message}`);
    continue;
  }
  if (!validateMetadata(metadata)) {
    failures.push(`${entry.name}/quest.json: ${ajv.errorsText(validateMetadata.errors, { separator: '; ' })}`);
    continue;
  }
  if (ids.has(metadata.id)) failures.push(`${entry.name}: duplicate Quest id ${metadata.id}`);
  if (sequences.has(metadata.sequence)) failures.push(`${entry.name}: duplicate sequence ${metadata.sequence}`);
  ids.add(metadata.id);
  sequences.add(metadata.sequence);
  const blueprintResult = validateBlueprint(blueprint);
  if (!blueprintResult.valid) {
    failures.push(`${entry.name}/blueprint.json: ${JSON.stringify(blueprintResult.errors)}`);
    continue;
  }
  if (blueprint.landingPage !== metadata.target.url) failures.push(`${entry.name}: blueprint landingPage must equal quest target.url`);
  if (blueprint.preferredVersions?.wp !== metadata.environment.wordpress || blueprint.preferredVersions?.php !== metadata.environment.php) {
    failures.push(`${entry.name}: runtime versions must match the metadata pins`);
  }
  if (metadata.hints.map((hint) => hint.level).join(',') !== '1,2,3') failures.push(`${entry.name}: hints must be ordered levels 1,2,3`);
  if (/\bTODO\b/.test(JSON.stringify(metadata))) failures.push(`${entry.name}: unfinished TODO in published metadata`);
  const pluginSource = (file) => blueprint.steps?.find((step) => step.step === 'writeFile' && step.path === `/wordpress/wp-content/plugins/${file}`)?.data;
  const source = pluginSource(metadata.editor.file);
  if (typeof source !== 'string' || !source.includes(metadata.walkthrough.before)) {
    failures.push(`${entry.name}: walkthrough.before must match the actual editor fixture`);
  }
  for (const file of [metadata.editor.file, metadata.postPassReview.advancedChallenge?.editorFile].filter(Boolean)) {
    if (typeof pluginSource(file) !== 'string') failures.push(`${entry.name}: editor file ${file} is not created by the Blueprint`);
    if (!blueprint.steps?.some((step) => step.step === 'activatePlugin' && step.pluginPath === file)) {
      failures.push(`${entry.name}: editor plugin ${file} is not activated by the Blueprint`);
    }
  }
}
if (entries.length === 0) failures.push('No Quest directories found');
if (failures.length) {
  console.error(`Quest validation failed:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`Quest validation passed: ${entries.length} Quest directories (schema, versions, hints, editor files, walkthrough alignment)`);
}
