import type { PlaygroundClient } from '@wp-playground/client';
import type { QuestDefinition, ValidationResult } from '../quests/types';
import {
  assertAllowedPath,
  buildBrief,
  buildRunRecord,
  summarizeValidation,
  type AgentBrief,
  type AgentRunRecord,
  type AgentToolSurface,
  type DisclosureLevel,
  type FetchedPage,
  type ToolCallRecord,
  type ToolName,
  type ValidationRecord,
} from './protocol';

const decoder = new TextDecoder();

/**
 * Wraps a live Playground client as an instrumented agent tool surface.
 *
 * Every call is recorded so a run can be audited afterwards. Paths are confined
 * to the WordPress tree, and `validate` is intentionally absent from the surface
 * -- the agent can observe the runtime, but only the harness may judge it.
 */
export class AgentSession {
  readonly brief: AgentBrief;
  readonly tools: AgentToolSurface;

  private readonly toolCalls: ToolCallRecord[] = [];
  private readonly validations: ValidationRecord[] = [];
  private readonly startedAtMs = Date.now();
  private readonly startedAt = new Date().toISOString();
  private seq = 0;

  constructor(
    private readonly client: PlaygroundClient,
    private readonly quest: QuestDefinition,
    private readonly agent: string,
    private readonly disclosure: DisclosureLevel = 'guided',
  ) {
    this.brief = buildBrief(quest.metadata, disclosure);
    this.tools = {
      readFile: (path) => this.record('readFile', path, () => this.client.readFileAsText(assertAllowedPath(path))),
      writeFile: (path, data) =>
        this.record('writeFile', path, () => this.client.writeFile(assertAllowedPath(path), data)),
      listFiles: (path) => this.record('listFiles', path, () => this.client.listFiles(assertAllowedPath(path))),
      fileExists: (path) => this.record('fileExists', path, () => this.client.fileExists(assertAllowedPath(path))),
      fetchUrl: (url) => this.record('fetchUrl', url, () => this.fetchUrl(url)),
      runPhp: (code) => this.record('runPhp', `${code.slice(0, 60)}...`, () => this.runPhp(code)),
    };
  }

  private async record<T>(tool: ToolName, argument: string, action: () => T | Promise<T>): Promise<T> {
    const seq = ++this.seq;
    try {
      const value = await action();
      this.toolCalls.push({ seq, tool, argument, ok: true });
      return value;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.toolCalls.push({ seq, tool, argument, ok: false, error: message });
      throw error;
    }
  }

  private async fetchUrl(url: string): Promise<FetchedPage> {
    const response = await this.client.request({ url });
    return { status: response.httpStatusCode, html: decoder.decode(response.bytes) };
  }

  private async runPhp(code: string): Promise<string> {
    const response = await this.client.run({ code });
    return decoder.decode(response.bytes).trim();
  }

  /**
   * Runs the authored Validator and records the verdict.
   *
   * The agent may request this, but cannot influence the outcome: the Validator
   * reads the runtime directly and is the same code path the human UI uses.
   */
  async validate(): Promise<ValidationResult> {
    const result = await this.quest.validate(this.client);
    this.validations.push(summarizeValidation(result, ++this.seq));
    return result;
  }

  finish(error?: unknown): AgentRunRecord {
    return buildRunRecord({
      questId: this.quest.metadata.id,
      agent: this.agent,
      disclosure: this.disclosure,
      startedAt: this.startedAt,
      durationMs: Date.now() - this.startedAtMs,
      toolCalls: this.toolCalls,
      validations: this.validations,
      error: error === undefined ? undefined : error instanceof Error ? error.message : String(error),
    });
  }
}

/** An agent policy under test: it may use the tools, then stop. */
export type AgentPolicy = (session: AgentSession) => Promise<void>;

/**
 * Executes one policy against one booted Quest and returns the run record.
 *
 * A thrown policy error is recorded as an `error` outcome rather than
 * propagated, so a crashed agent still produces a comparable record.
 */
export async function runAgentQuest(options: {
  client: PlaygroundClient;
  quest: QuestDefinition;
  agent: string;
  policy: AgentPolicy;
  disclosure?: DisclosureLevel;
}): Promise<AgentRunRecord> {
  const session = new AgentSession(options.client, options.quest, options.agent, options.disclosure);
  try {
    await options.policy(session);
    return session.finish();
  } catch (error) {
    return session.finish(error);
  }
}
