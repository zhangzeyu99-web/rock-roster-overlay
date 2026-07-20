export function createAsyncGate() {
  let tail: Promise<void> = Promise.resolve();

  return async function runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const previous = tail.catch(() => undefined);
    const run = previous.then(task);
    tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };
}
