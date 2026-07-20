export type RequestSchedulerRelease = () => void;

export type RequestSchedulerOptions = {
  groupKey?: string | null;
  groupMaxConcurrent?: number;
  minDelayMs?: number;
  priority?: number;
};

type NormalizedRequestSchedulerOptions = {
  groupKey: string | null;
  groupMaxConcurrent: number;
  minDelayMs: number;
  priority: number;
};

type PendingRequest = {
  sequence: number;
  options: NormalizedRequestSchedulerOptions;
  resolve: (release: RequestSchedulerRelease) => void;
};

type GroupState = {
  active: number;
  lastStartedAt: number;
};

const normalizePositiveInteger = (value: unknown, fallback: number): number => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Coordinates a global concurrency limit with optional per-group limits and pacing.
 * Higher-priority requests overtake queued lower-priority requests, while preserving
 * FIFO ordering between requests with the same priority.
 */
export class AdjustableRequestScheduler {
  private limit: number;
  private activeCount = 0;
  private nextSequence = 0;
  private readonly queue: PendingRequest[] = [];
  private readonly groups = new Map<string, GroupState>();
  private wakeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(limit: number) {
    this.limit = normalizePositiveInteger(limit, 1);
  }

  setLimit(limit: number): void {
    this.limit = normalizePositiveInteger(limit, 1);
    this.drain();
  }

  acquire(options: RequestSchedulerOptions = {}): Promise<RequestSchedulerRelease> {
    const groupKey = typeof options.groupKey === "string" && options.groupKey.length > 0
      ? options.groupKey
      : null;
    const normalizedOptions: NormalizedRequestSchedulerOptions = {
      groupKey,
      groupMaxConcurrent: Math.max(0, Math.floor(Number(options.groupMaxConcurrent) || 0)),
      minDelayMs: Math.max(0, Math.floor(Number(options.minDelayMs) || 0)),
      priority: Number.isFinite(Number(options.priority)) ? Number(options.priority) : 0,
    };

    return new Promise<RequestSchedulerRelease>((resolve) => {
      this.queue.push({
        sequence: this.nextSequence,
        options: normalizedOptions,
        resolve,
      });
      this.nextSequence += 1;
      this.drain();
    });
  }

  get active(): number {
    return this.activeCount;
  }

  get pending(): number {
    return this.queue.length;
  }

  private getGroupState(groupKey: string): GroupState {
    const current = this.groups.get(groupKey);
    if (current) return current;
    const state = { active: 0, lastStartedAt: 0 };
    this.groups.set(groupKey, state);
    return state;
  }

  private getRemainingDelay(request: PendingRequest, now: number): number {
    const { groupKey, minDelayMs } = request.options;
    if (!groupKey || minDelayMs === 0) return 0;
    const state = this.getGroupState(groupKey);
    return Math.max(0, minDelayMs - (now - state.lastStartedAt));
  }

  private hasGroupCapacity(request: PendingRequest): boolean {
    const { groupKey, groupMaxConcurrent } = request.options;
    if (!groupKey || groupMaxConcurrent === 0) return true;
    return this.getGroupState(groupKey).active < groupMaxConcurrent;
  }

  private findNextRequestIndex(now: number): number {
    let selectedIndex = -1;
    for (let index = 0; index < this.queue.length; index += 1) {
      const request = this.queue[index];
      if (!this.hasGroupCapacity(request) || this.getRemainingDelay(request, now) > 0) continue;
      if (selectedIndex < 0) {
        selectedIndex = index;
        continue;
      }
      const selected = this.queue[selectedIndex];
      if (
        request.options.priority > selected.options.priority
        || (
          request.options.priority === selected.options.priority
          && request.sequence < selected.sequence
        )
      ) {
        selectedIndex = index;
      }
    }
    return selectedIndex;
  }

  private scheduleNextWakeup(now: number): void {
    let nextDelay = Number.POSITIVE_INFINITY;
    for (const request of this.queue) {
      if (!this.hasGroupCapacity(request)) continue;
      const remainingDelay = this.getRemainingDelay(request, now);
      if (remainingDelay > 0) nextDelay = Math.min(nextDelay, remainingDelay);
    }
    if (!Number.isFinite(nextDelay)) return;
    this.wakeTimer = setTimeout(() => {
      this.wakeTimer = null;
      this.drain();
    }, Math.max(1, nextDelay));
  }

  private grant(request: PendingRequest): void {
    this.activeCount += 1;
    const { groupKey } = request.options;
    if (groupKey) {
      const state = this.getGroupState(groupKey);
      state.active += 1;
      state.lastStartedAt = Date.now();
    }

    let released = false;
    request.resolve(() => {
      if (released) return;
      released = true;
      this.activeCount = Math.max(0, this.activeCount - 1);
      if (groupKey) {
        const state = this.getGroupState(groupKey);
        state.active = Math.max(0, state.active - 1);
      }
      this.drain();
    });
  }

  private drain(): void {
    if (this.wakeTimer) {
      clearTimeout(this.wakeTimer);
      this.wakeTimer = null;
    }

    while (this.activeCount < this.limit && this.queue.length > 0) {
      const now = Date.now();
      const nextIndex = this.findNextRequestIndex(now);
      if (nextIndex < 0) {
        this.scheduleNextWakeup(now);
        return;
      }
      const [request] = this.queue.splice(nextIndex, 1);
      this.grant(request);
    }
  }
}
