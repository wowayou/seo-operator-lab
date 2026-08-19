import type { BlueprintV1Declaration } from '@wp-playground/client';
import blueprintJson from './blueprint.json';
import metadataJson from './quest.json';
import type { QuestDefinition, QuestMetadata } from '../../types';
import { validate } from './validator';

const quest: QuestDefinition = {
  metadata: metadataJson as QuestMetadata,
  blueprint: blueprintJson as BlueprintV1Declaration,
  validate,
};

export default quest;
