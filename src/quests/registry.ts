import type { QuestDefinition } from './types';

const modules = import.meta.glob<{ default: QuestDefinition }>('./wordpress/*/index.ts', {
  eager: true,
});

export const quests = Object.values(modules)
  .map((module) => module.default)
  .sort((left, right) => left.metadata.sequence - right.metadata.sequence);

if (quests.length === 0) throw new Error('No Quest modules were discovered');

const questById = new Map(quests.map((quest) => [quest.metadata.id, quest]));

if (questById.size !== quests.length) throw new Error('Quest ids must be unique');

export function getQuest(id: string | null | undefined): QuestDefinition {
  return (id && questById.get(id)) || quests[0];
}
