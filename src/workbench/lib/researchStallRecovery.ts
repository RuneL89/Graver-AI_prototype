/**
 * Round-based stall recovery for parallel research tasks.
 *
 * A task that hits a retryable error (429, timeout, network failure) is marked
 * `stalled`. After the initial wave completes, all stalled tasks are retried
 * together. This repeats up to `maxWaves`. After that, remaining stalled tasks
 * are marked `failed`.
 */

export const MAX_STALL_WAVES = 3;

export function isRetryableError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /429|rate.limit|timeout|network|econnreset|etimedout/i.test(msg);
}

export interface StallRecoveryWaveResult {
  stalledCount: number;
  completedCount: number;
  failedCount: number;
}

export interface StallRecoveryOptions {
  maxWaves: number;
  onWaveComplete?: (wave: number, result: StallRecoveryWaveResult) => void;
}

export interface StallRecoveryTask<T> {
  id: string;
  item: T;
  run: (item: T) => Promise<{ success: boolean; error?: string }>;
}

export interface StallRecoveryTaskResult {
  id: string;
  success: boolean;
  error?: string;
  stallWaves: number;
}

/**
 * Execute a batch of tasks with round-based stall recovery.
 *
 * Wave 0: run all tasks.
 * Wave 1..maxWaves: retry only stalled tasks.
 * After maxWaves: mark remaining stalled as failed.
 */
export async function runWithStallRecovery<T>(
  tasks: StallRecoveryTask<T>[],
  options: StallRecoveryOptions
): Promise<StallRecoveryTaskResult[]> {
  const results = new Map<string, StallRecoveryTaskResult>();

  for (const task of tasks) {
    results.set(task.id, {
      id: task.id,
      success: false,
      stallWaves: 0,
    });
  }

  let pendingIds = new Set(tasks.map((t) => t.id));

  for (let wave = 0; wave <= options.maxWaves; wave++) {
    if (pendingIds.size === 0) break;

    const waveTasks = tasks.filter((t) => pendingIds.has(t.id));
    const wavePromises = waveTasks.map(async (task) => {
      try {
        const runResult = await task.run(task.item);
        if (runResult.success) {
          results.set(task.id, {
            id: task.id,
            success: true,
            stallWaves: wave,
          });
          return { id: task.id, outcome: 'completed' as const };
        }

        const errorMsg = runResult.error || 'Unknown error';
        if (isRetryableError(errorMsg) && wave < options.maxWaves) {
          results.set(task.id, {
            id: task.id,
            success: false,
            error: errorMsg,
            stallWaves: wave + 1,
          });
          return { id: task.id, outcome: 'stalled' as const };
        }

        results.set(task.id, {
          id: task.id,
          success: false,
          error: errorMsg,
          stallWaves: wave,
        });
        return { id: task.id, outcome: 'failed' as const };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (isRetryableError(err) && wave < options.maxWaves) {
          results.set(task.id, {
            id: task.id,
            success: false,
            error: errorMsg,
            stallWaves: wave + 1,
          });
          return { id: task.id, outcome: 'stalled' as const };
        }

        results.set(task.id, {
          id: task.id,
          success: false,
          error: errorMsg,
          stallWaves: wave,
        });
        return { id: task.id, outcome: 'failed' as const };
      }
    });

    const waveResults = await Promise.all(wavePromises);

    const stalledIds = new Set(
      waveResults.filter((r) => r.outcome === 'stalled').map((r) => r.id)
    );
    const completedCount = waveResults.filter((r) => r.outcome === 'completed').length;
    const failedCount = waveResults.filter((r) => r.outcome === 'failed').length;

    options.onWaveComplete?.(wave, {
      stalledCount: stalledIds.size,
      completedCount,
      failedCount,
    });

    pendingIds = stalledIds;
  }

  return Array.from(results.values());
}
