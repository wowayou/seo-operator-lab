import type { BlueprintV1Declaration, PlaygroundClient } from '@wp-playground/client';

export type CheckGroup = 'target' | 'regression';
export type ReviewLevel = 'lab' | 'production';

export interface ValidationCheck {
  id: string;
  name: string;
  group: CheckGroup;
  passed: boolean;
  expected: string;
  actual: string;
  details?: string;
}

export interface ImplementationReview {
  level: ReviewLevel;
  label: string;
  summary: string;
}

export interface ValidationResult {
  passed: boolean;
  targetPassed: boolean;
  checks: ValidationCheck[];
  details: string;
  review?: ImplementationReview;
}

export interface QuestHint {
  level: number;
  title: string;
  text: string;
  href?: string;
  linkLabel?: string;
  action?: 'open-editor';
}

export interface AdvancedChallenge {
  title: string;
  description: string;
  why?: string;
  steps?: string[];
  instruction: string;
  editorFile: string;
  buttonLabel: string;
}

export interface QuestMetadata {
  $schema?: string;
  id: string;
  phase: 'B';
  sequence: number;
  platform: 'wordpress';
  title: string;
  description: string;
  difficulty: number;
  skills: string[];
  environment: {
    wordpress: string;
    php: string;
  };
  objective: {
    summary: string;
    completion: string;
  };
  target: {
    url: string;
  };
  editor: {
    file: string;
    label: string;
    location: string;
  };
  hints: QuestHint[];
  searchQuery: string;
  success: {
    title: string;
    message: string;
  };
  postPassReview: {
    title: string;
    notes: string[];
    advancedChallenge?: AdvancedChallenge;
  };
  review: {
    intervalsDays: number[];
  };
  scoring: {
    base: number;
    hintPenalty: number[];
    solutionPenalty: number;
  };
}

export interface QuestDefinition {
  metadata: QuestMetadata;
  blueprint: BlueprintV1Declaration;
  validate: (client: PlaygroundClient) => Promise<ValidationResult>;
}
