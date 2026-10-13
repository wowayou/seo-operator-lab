import type { BlueprintV1Declaration } from '@wp-playground/client';
import blueprintJson from './blueprint.json';
import metadataJson from './quest.json';
import type { QuestDefinition, QuestMetadata } from '../../types';

const quest: QuestDefinition = {
  metadata: metadataJson as QuestMetadata,
  blueprint: blueprintJson as BlueprintV1Declaration,
  validate: async (client) => (await import('./validator')).validate(client),
};

export default quest;
