import type { QuestMetadata, ValidationResult } from '../quests/types';

/**
 * The agent-facing contract for one benchmark run.
 *
 * The harness deliberately separates three things that a benchmark must keep
 * apart: what the agent is told (`AgentBrief`), what the agent may do
 * (`AgentToolSurface`), and what is measured (`AgentRunRecord`). Only the
 * Validator decides PASS/FAIL, and it is never part of the agent's tool surface.
 */

/**
 * How much of the authored Quest is disclosed to the agent.
 *
 * A benchmark result is only comparable against runs at the same level, so the
 * level is recorded with every run.
 */
export type DisclosureLevel = 'minimal' | 'guided' | 'hinted';

export interface AgentBrief {
  questId: string;
  title: string;
  disclosure: DisclosureLevel;
  /** The reported symptom, as an operator would receive it. */
  description: string;
  objective: string;
  completion: string;
  targetUrl: string;
  /** Only present at `guided` and above: where the fault is owned. */
  editorFile?: string;
  editorLocation?: string;
  /** Only present at `hinted`: the authored progressive hints. */
  hints?: string[];
}

/**
 * Builds the brief for one disclosure level.
 *
 * Everything that encodes the answer -- hints, the post-pass review, the
 * expected canonical, the Validator's check ids -- is withheld unless the level
 * explicitly grants it. `postPassReview` is never disclosed at any level
 * because it names the exact production fix.
 */
export function buildBrief(metadata: QuestMetadata, disclosure: DisclosureLevel): AgentBrief {
  const brief: AgentBrief = {
    questId: metadata.id,
    title: metadata.title,
    disclosure,
    description: metadata.description,
    objective: metadata.objective.summary,
    completion: metadata.objective.completion,
    targetUrl: metadata.target.url,
  };

  if (disclosure === 'guided' || disclosure === 'hinted') {
    brief.editorFile = metadata.editor.file;
    brief.editorLocation = metadata.editor.location;
  }
  if (disclosure === 'hinted') {
    brief.hints = [...metadata.hints]
      .sort((left, right) => left.level - right.level)
      .map((hint) => `${hint.title}: ${hint.text}`);
  }

  return brief;
}

/** The only filesystem subtree an agent may read or write. */
export const AGENT_FS_ROOT = '/wordpress';

/**
 * Resolves `.` and `..` segments without touching the host filesystem.
 *
 * The agent's paths cross a `postMessage` boundary into the PHP-WASM virtual
 * filesystem, so they must be normalized here rather than trusted.
 */
export function normalizeVfsPath(input: string): string {
  if (!input.startsWith('/')) throw new Error(`Path must be absolute: ${input}`);
  const resolved: string[] = [];
  for (const segment of input.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (resolved.length === 0) throw new Error(`Path escapes the filesystem root: ${input}`);
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  return `/${resolved.join('/')}`;
}

/**
 * Confines the agent to the WordPress installation.
 *
 * This keeps runs comparable: an agent cannot reach PHP internals or the
 * harness itself, so two runs of the same Quest see the same world. It is not a
 * defense against Quest leakage -- the lab's own source is not in this
 * filesystem at all. See docs/agent-benchmark.md for that threat model.
 */
export function assertAllowedPath(input: string): string {
  const normalized = normalizeVfsPath(input);
  if (normalized !== AGENT_FS_ROOT && !normalized.startsWith(`${AGENT_FS_ROOT}/`)) {
    throw new Error(`Path is outside ${AGENT_FS_ROOT}: ${normalized}`);
  }
  return normalized;
}

export interface FetchedPage {
  status: number;
  html: string;
}

/** Everything the agent may do inside the runtime. */
export interface AgentToolSurface {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, data: string) => Promise<void>;
  listFiles: (path: string) => Promise<string[]>;
  fileExists: (path: string) => Promise<boolean>;
  fetchUrl: (url: string) => Promise<FetchedPage>;
  runPhp: (code: string) => Promise<string>;
}

export type ToolName = keyof AgentToolSurface;

export interface ToolCallRecord {
  seq: number;
  tool: ToolName;
  /** Argument summary only; file contents are not recorded. */
  argument: string;
  ok: boolean;
  error?: string;
}

export interface ValidationRecord {
  seq: number;
  passed: boolean;
  targetPassed: boolean;
  failedCheckIds: string[];
  reviewLevel?: string;
}

export type RunOutcome = 'pass' | 'fail' | 'error';

export interface AgentRunRecord {
  questId: string;
  /** Identifies the policy or model under test. */
  agent: string;
  disclosure: DisclosureLevel;
  /**
   * Whether the Quest came from the held-out set.
   *
   * `false` means the fixture and its Validator are readable in the deployed
   * bundle, so the result measures retrieval as much as diagnosis and must be
   * reported as open-book. This is a property of the Quest, not of the agent,
   * and it is recorded per run because the two are not comparable.
   */
  heldOut: boolean;
  startedAt: string;
  durationMs: number;
  outcome: RunOutcome;
  toolCallCount: number;
  validationCount: number;
  /**
   * Validations where the reported symptom was fixed but a regression check
   * failed. This is the measurement a chat transcript cannot produce.
   */
  regressionsIntroduced: number;
  reviewLevel?: string;
  error?: string;
  toolCalls: ToolCallRecord[];
  validations: ValidationRecord[];
}

export function summarizeValidation(result: ValidationResult, seq: number): ValidationRecord {
  return {
    seq,
    passed: result.passed,
    targetPassed: result.targetPassed,
    failedCheckIds: result.checks.filter((check) => !check.passed).map((check) => check.id),
    reviewLevel: result.review?.level,
  };
}

/**
 * Derives the run record from an observed transcript.
 *
 * Deliberately reports raw counts rather than a composite score. A score needs
 * a stable Quest set and a calibrated penalty model; neither exists yet, and an
 * uncalibrated number would look more authoritative than it is.
 */
export function buildRunRecord(input: {
  questId: string;
  agent: string;
  disclosure: DisclosureLevel;
  /** Defaults to `false`: a Quest is open-book unless it is known to be held out. */
  heldOut?: boolean;
  startedAt: string;
  durationMs: number;
  toolCalls: ToolCallRecord[];
  validations: ValidationRecord[];
  error?: string;
}): AgentRunRecord {
  const last = input.validations[input.validations.length - 1];
  const outcome: RunOutcome = input.error ? 'error' : last?.passed ? 'pass' : 'fail';
  return {
    questId: input.questId,
    agent: input.agent,
    disclosure: input.disclosure,
    heldOut: input.heldOut ?? false,
    startedAt: input.startedAt,
    durationMs: input.durationMs,
    outcome,
    toolCallCount: input.toolCalls.length,
    validationCount: input.validations.length,
    regressionsIntroduced: input.validations.filter((entry) => entry.targetPassed && !entry.passed).length,
    reviewLevel: last?.reviewLevel,
    error: input.error,
    toolCalls: input.toolCalls,
    validations: input.validations,
  };
}
