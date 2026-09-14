export const runTasksWithConcurrency = async (
  tasks: Array<() => Promise<void>>,
  concurrency: number,
  shouldContinue: () => boolean = () => true,
): Promise<void> => {
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, Math.floor(Number(concurrency) || 1)), tasks.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < tasks.length && shouldContinue()) {
      const taskIndex = nextIndex;
      nextIndex += 1;
      await tasks[taskIndex]();
    }
  }));
};
