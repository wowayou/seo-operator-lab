import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const questsRoot = path.join(root, 'src', 'quests', 'wordpress');
const draftsRoot = path.join(questsRoot, '_drafts');
const slug = process.argv[2];
const title = process.argv.slice(3).join(' ') || (slug ? slug.replace(/-/g, ' ') : 'New Quest');

if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  console.error('Usage: npm run quest:new -- <lowercase-slug> [Title]');
  process.exit(1);
}

const directories = (await readdir(questsRoot, { withFileTypes: true })).filter(
  (entry) => entry.isDirectory() && !entry.name.startsWith('_'),
);
let nextSequence = 1;
for (const directory of directories) {
  const metadataPath = path.join(questsRoot, directory.name, 'quest.json');
  try {
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    nextSequence = Math.max(nextSequence, Number(metadata.sequence) + 1);
  } catch {
    // The authoring validator will report incomplete formal Quest directories.
  }
}

const sequence = String(nextSequence).padStart(3, '0');
const id = `wp-${slug}-${sequence}`;
const directory = path.join(draftsRoot, `${slug}-${sequence}`);
await mkdir(draftsRoot, { recursive: true });
// Fail on an existing draft rather than overwrite an author's work.
await mkdir(directory);

const metadata = {
  $schema: '../../../../schemas/quest.schema.json',
  id,
  phase: 'B',
  sequence: nextSequence,
  platform: 'wordpress',
  title,
  description: 'TODO: describe the observable symptom and the constraint that must remain true.',
  difficulty: 2,
  skills: ['TODO'],
  environment: { wordpress: '6.7', php: '8.3' },
  objective: {
    summary: 'TODO: state the implementation goal.',
    completion: 'TODO: state the target and regression conditions',
  },
  target: { url: '/TODO/' },
  editor: {
    file: 'todo-plugin/todo-plugin.php',
    label: '打开插件编辑器',
    location: '后台路径：工具 → 插件文件编辑器',
  },
  hints: [
    { level: 1, title: 'TODO: evidence', text: 'TODO: start with deterministic evidence.' },
    { level: 2, title: 'TODO: ownership', text: 'TODO: guide source ownership discovery.' },
    { level: 3, title: 'TODO: smallest change', text: 'TODO: reveal the narrowest useful repair.', action: 'open-editor' },
  ],
  walkthrough: {
    concept: 'TODO: explain the term and the scope of the lab repair.',
    steps: [
      'TODO: name the baseline validation button and evidence.',
      'TODO: name the editor file and first-use warning.',
      'TODO: explain the exact replacement and the Update File save button.',
      'TODO: return to validation and explain reset/recovery.',
    ],
    before: 'TODO: exact authored fault snippet',
    after: 'TODO: exact narrow lab repair',
    caution: 'TODO: distinguish lab edits from production and document security limits.',
  },
  searchQuery: 'TODO: search terms',
  success: { title: 'TODO: success title', message: 'TODO: success message' },
  postPassReview: {
    title: '实现复盘',
    notes: ['TODO: document one maintainability or upgrade consideration.'],
  },
  review: { intervalsDays: [2, 7, 21] },
  scoring: { base: 100, hintPenalty: [0, 5, 12, 25], solutionPenalty: 45 },
};

const blueprint = {
  $schema: 'https://playground.wordpress.net/blueprint-schema.json',
  landingPage: '/TODO/',
  preferredVersions: { php: '8.3', wp: '6.7' },
  login: true,
  steps: [
    { step: 'runPHP', code: "<?php\n// TODO: create deterministic content and the deliberate fault.\n" },
  ],
};

const validator = `import type { PlaygroundClient } from '@wp-playground/client';
import type { ValidationResult } from '../../types';

export async function validate(_client: PlaygroundClient): Promise<ValidationResult> {
  throw new Error('TODO: implement a deterministic validator before moving this Quest out of _drafts');
}
`;
const index = `import type { BlueprintV1Declaration } from '@wp-playground/client';
import blueprintJson from './blueprint.json';
import metadataJson from './quest.json';
import type { QuestDefinition, QuestMetadata } from '../../types';

const quest: QuestDefinition = {
  metadata: metadataJson as QuestMetadata,
  blueprint: blueprintJson as BlueprintV1Declaration,
  validate: async (client) => (await import('./validator')).validate(client),
};

export default quest;
`;

await writeFile(path.join(directory, 'quest.json'), `${JSON.stringify(metadata, null, 2)}\n`);
await writeFile(path.join(directory, 'blueprint.json'), `${JSON.stringify(blueprint, null, 2)}\n`);
await writeFile(path.join(directory, 'validator.ts'), validator);
await writeFile(path.join(directory, 'index.ts'), index);
await writeFile(
  path.join(directory, 'README.md'),
  `# ${id}\n\nThis Quest is a draft. Complete the TODOs, run \`npm run validate:quests\`, then move the directory from \`_drafts/\` into \`src/quests/wordpress/\`.\n`,
);

console.log(`Created draft Quest ${id} at ${path.relative(root, directory)}`);
