import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlaygroundClient } from '@wp-playground/client';
import type { QuestDefinition } from './quests/types';
import { OperationTimeoutError, RuntimeSession, withDeadline } from './runtime';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const quest = {} as QuestDefinition;
function fakeClient() { return { onNavigation: vi.fn().mockResolvedValue(undefined) } as unknown as PlaygroundClient; }
function setup(startClient = vi.fn().mockResolvedValue(fakeClient())) {
  const options = {
    replaceFrame: vi.fn(() => ({}) as HTMLIFrameElement), onState: vi.fn(), onError: vi.fn(), onNavigation: vi.fn(),
    startClient, bootTimeoutMs: 100, operationTimeoutMs: 100,
  };
  return { runtime: new RuntimeSession(options), options };
}
afterEach(() => vi.useRealTimers());

describe('Runtime lifecycle', () => {
  it('bounds a stalled boot, stops its frame, and permits an explicit retry', async () => {
    vi.useFakeTimers();
    const slow = deferred<PlaygroundClient>();
    const { runtime, options } = setup(vi.fn().mockReturnValueOnce(slow.promise).mockResolvedValue(fakeClient()));
    const first = runtime.boot(quest);
    await vi.advanceTimersByTimeAsync(101);
    expect(await first).toBe(false);
    expect(runtime.available).toBe(false);
    expect(options.replaceFrame).toHaveBeenCalledTimes(2);
    expect(options.onError).toHaveBeenCalledWith(expect.stringContaining('启动超过'), 'booting');
    expect(await runtime.boot(quest)).toBe(true);
    const obsolete = fakeClient();
    slow.resolve(obsolete);
    await Promise.resolve();
    expect(obsolete.onNavigation).not.toHaveBeenCalled();
    expect(runtime.available).toBe(true);
    expect(options.startClient).toHaveBeenCalledTimes(2); // no automatic retry loop
  });
  it('ignores a superseded boot and its late failure', async () => {
    const old = deferred<PlaygroundClient>();
    const { runtime, options } = setup(vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue(fakeClient()));
    const first = runtime.boot(quest);
    expect(await runtime.boot(quest)).toBe(true);
    old.reject(new Error('late failure'));
    expect(await first).toBe(false);
    expect(runtime.available).toBe(true);
    expect(options.onError).not.toHaveBeenCalled();
  });
  it('handles a rejected startup without an unhandled rejection', async () => {
    const { runtime, options } = setup(vi.fn().mockRejectedValue(new Error('offline')));
    expect(await runtime.boot(quest)).toBe(false);
    expect(options.onError).toHaveBeenCalledWith(expect.stringContaining('offline'), 'booting');
  });
  it('allows only one operation and discards old results after reset', async () => {
    const { runtime } = setup();
    await runtime.boot(quest);
    const work = deferred<string>();
    const first = runtime.execute('validating', () => work.promise);
    const second = vi.fn();
    expect(await runtime.execute('navigating', second)).toBeUndefined();
    expect(second).not.toHaveBeenCalled();
    await runtime.boot(quest);
    work.resolve('stale PASS');
    expect(await first).toBeUndefined();
    expect(runtime.available).toBe(true);
  });
  it('does not send more work after a PHP timeout or silently erase learner edits', async () => {
    vi.useFakeTimers();
    const { runtime, options } = setup();
    await runtime.boot(quest);
    const work = deferred<string>();
    const call = runtime.execute('validating', () => work.promise);
    await vi.advanceTimersByTimeAsync(101);
    expect(await call).toBeUndefined();
    expect(runtime.available).toBe(false);
    expect(options.replaceFrame).toHaveBeenCalledTimes(1);
    expect(options.onError).toHaveBeenCalledWith(expect.stringContaining('复制备份'), 'validating');
    work.resolve('late PASS');
    await Promise.resolve();
    expect(runtime.available).toBe(false);
  });
  it('permits retry after a definite operation failure, without replacing its iframe', async () => {
    const { runtime, options } = setup();
    await runtime.boot(quest);
    expect(await runtime.execute('validating', async () => { throw new Error('bad response'); })).toBeUndefined();
    expect(runtime.available).toBe(true);
    expect(options.replaceFrame).toHaveBeenCalledTimes(1);
    expect(await runtime.execute('validating', async () => 'recovered')).toBe('recovered');
  });
});

describe('Deadline cleanup', () => {
  it('clears timers on success and abort', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    expect(await withDeadline(Promise.resolve(2), 100, controller.signal)).toBe(2);
    expect(vi.getTimerCount()).toBe(0);
    const work = deferred<number>();
    const result = withDeadline(work.promise, 100, controller.signal);
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    work.reject(new Error('handled late rejection'));
    expect(vi.getTimerCount()).toBe(0);
  });
  it('throws a distinct timeout error', async () => {
    vi.useFakeTimers();
    const result = withDeadline(new Promise(() => {}), 5, new AbortController().signal);
    const rejected = expect(result).rejects.toBeInstanceOf(OperationTimeoutError);
    await vi.advanceTimersByTimeAsync(6);
    await rejected;
  });
});
