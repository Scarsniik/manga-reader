import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { MultiSearchScraperRun } from "@/renderer/components/MultiSearch/types";

const RESULT_BATCH_SIZE = 100;
const RESULT_BATCH_DELAY_MS = 300;

type Options = {
  searchTokenRef: MutableRefObject<number>;
  setRuns: Dispatch<SetStateAction<MultiSearchScraperRun[]>>;
};

export default function useMultiSearchRunBatcher({
  searchTokenRef,
  setRuns,
}: Options) {
  const queuedRunsRef = useRef(new Map<string, MultiSearchScraperRun>());
  const queuedResultCountRef = useRef(0);
  const flushTimerRef = useRef<number | null>(null);

  const clearFlushTimer = useCallback(() => {
    if (flushTimerRef.current === null) {
      return;
    }

    window.clearTimeout(flushTimerRef.current);
    flushTimerRef.current = null;
  }, []);

  const clearRunUpdates = useCallback(() => {
    clearFlushTimer();
    queuedRunsRef.current.clear();
    queuedResultCountRef.current = 0;
  }, [clearFlushTimer]);

  const flushRunUpdates = useCallback((token: number = searchTokenRef.current) => {
    if (token !== searchTokenRef.current) {
      return;
    }

    clearFlushTimer();

    const queuedRuns = Array.from(queuedRunsRef.current.values());
    if (!queuedRuns.length) {
      return;
    }

    queuedRunsRef.current.clear();
    queuedResultCountRef.current = 0;
    const queuedRunsByScraperId = new Map(queuedRuns.map((run) => [run.scraper.id, run]));

    setRuns((currentRuns) => currentRuns.map((run) => (
      queuedRunsByScraperId.get(run.scraper.id) ?? run
    )));
  }, [clearFlushTimer, searchTokenRef, setRuns]);

  const queueRunUpdate = useCallback((
    token: number,
    run: MultiSearchScraperRun,
    newResultCount = 0,
    forceFlush = false,
  ) => {
    if (token !== searchTokenRef.current) {
      return;
    }

    queuedRunsRef.current.set(run.scraper.id, run);
    queuedResultCountRef.current += newResultCount;

    if (forceFlush || queuedResultCountRef.current >= RESULT_BATCH_SIZE) {
      flushRunUpdates(token);
      return;
    }

    if (flushTimerRef.current !== null) {
      return;
    }

    const timerId = window.setTimeout(() => {
      if (flushTimerRef.current !== timerId) {
        return;
      }

      flushTimerRef.current = null;
      flushRunUpdates(token);
    }, RESULT_BATCH_DELAY_MS);

    flushTimerRef.current = timerId;
  }, [flushRunUpdates, searchTokenRef]);

  useEffect(() => clearRunUpdates, [clearRunUpdates]);

  return {
    clearRunUpdates,
    flushRunUpdates,
    queueRunUpdate,
  };
}
