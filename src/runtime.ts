import type { PlaygroundClient } from '@wp-playground/client';
import type { QuestDefinition } from './quests/types';

export type RuntimeState = 'idle' | 'booting' | 'ready' | 'validating' | 'navigating' | 'error';
type Operation = 'booting' | 'validating' | 'navigating';
type StartClient = (iframe: HTMLIFrameElement, quest: QuestDefinition) => Promise<PlaygroundClient>;

export class OperationTimeoutError extends Error {}

/** A deadline bounds the UI wait; it does not pretend to cancel PHP execution. */
export function withDeadline<T>(work: Promise<T>, ms: number, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => finish(() => reject(new DOMException('Superseded runtime', 'AbortError')));
    const timer = setTimeout(() => finish(() => reject(new OperationTimeoutError('操作超时'))), ms);
    function finish(settle: () => void) {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      settle();
    }
    // Always attach rejection handlers, including when the signal is already aborted.
    work.then((value) => finish(() => resolve(value)), (error) => finish(() => reject(error)));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

interface RuntimeOptions {
  replaceFrame: () => HTMLIFrameElement;
  onState: (state: RuntimeState) => void;
  onError: (message: string, operation: Operation) => void;
  onNavigation: (url: string) => void;
  startClient?: StartClient;
  bootTimeoutMs?: number;
  operationTimeoutMs?: number;
}

/** One mutable WordPress session. Rebuilds invalidate every older async result. */
export class RuntimeSession {
  private client?: PlaygroundClient;
  private generation = 0;
  private controller = new AbortController();
  private state: RuntimeState = 'idle';

  constructor(private readonly options: RuntimeOptions) {}

  get available(): boolean {
    return Boolean(this.client) && (this.state === 'ready' || this.state === 'error');
  }

  private setState(state: RuntimeState): void {
    this.state = state;
    this.options.onState(state);
  }

  async boot(quest: QuestDefinition): Promise<boolean> {
    this.controller.abort();
    this.controller = new AbortController();
    const generation = ++this.generation;
    this.client = undefined;
    const iframe = this.options.replaceFrame();
    this.setState('booting');
    const start: StartClient = this.options.startClient ?? (async (frame, definition) => {
      const { startPlaygroundWeb } = await import('@wp-playground/client');
      return startPlaygroundWeb({
        iframe: frame,
        remoteUrl: 'https://playground.wordpress.net/remote.html',
        blueprint: definition.blueprint,
      });
    });
    try {
      const work = (async () => {
        const client = await start(iframe, quest);
        if (generation !== this.generation) return client;
        await client.onNavigation((url) => {
          if (generation === this.generation) this.options.onNavigation(url);
        });
        return client;
      })();
      const client = await withDeadline(work, this.options.bootTimeoutMs ?? 180_000, this.controller.signal);
      if (generation !== this.generation) return false;
      this.client = client;
      this.setState('ready');
      return true;
    } catch (error) {
      if (generation !== this.generation) return false;
      // A failed boot has no learner edits. Remove it to stop downloads/workers.
      ++this.generation;
      this.controller.abort();
      this.options.replaceFrame();
      this.setState('error');
      this.options.onError(
        error instanceof OperationTimeoutError
          ? '启动超过 180 秒。请检查网络能否访问 playground.wordpress.net，然后点击「重试启动」。不会自动重复下载。'
          : `环境启动失败：${error instanceof Error ? error.message : String(error)}。可点击「重试启动」。`,
        'booting',
      );
      return false;
    }
  }

  async execute<T>(operation: Exclude<Operation, 'booting'>, action: (client: PlaygroundClient) => Promise<T>): Promise<T | undefined> {
    if (!this.available || !this.client) return undefined;
    const generation = this.generation;
    const client = this.client;
    this.setState(operation);
    try {
      const result = await withDeadline(
        Promise.resolve().then(() => action(client)),
        this.options.operationTimeoutMs ?? 30_000,
        this.controller.signal,
      );
      if (generation !== this.generation) return undefined;
      this.setState('ready');
      return result;
    } catch (error) {
      if (generation !== this.generation) return undefined;
      if (error instanceof OperationTimeoutError) {
        // PHP may still be busy. Do not send overlapping work or erase the edits.
        this.client = undefined;
        ++this.generation;
      }
      this.setState('error');
      this.options.onError(
        error instanceof OperationTimeoutError
          ? '操作超过 30 秒，已停止发送新请求。编辑内容仍在当前画面，可先复制备份，再点击「重置环境」重建。'
          : `操作未完成：${error instanceof Error ? error.message : String(error)}。这不是判题 FAIL；请检查后重试。`,
        operation,
      );
      return undefined;
    }
  }
}
