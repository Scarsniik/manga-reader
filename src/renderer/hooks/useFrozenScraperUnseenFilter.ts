import { useCallback, useEffect, useRef, useState } from "react";
import type { ScraperViewHistoryRecord } from "@/shared/scraper";

const EMPTY_CARD_IDS = new Set<string>();

type FrozenScraperUnseenFilter = {
  active: boolean;
  recordsById: Map<string, ScraperViewHistoryRecord>;
  newCardIds: Set<string>;
  setActive: (active: boolean) => void;
};

export default function useFrozenScraperUnseenFilter(
  liveRecordsById: Map<string, ScraperViewHistoryRecord>,
  currentListNewCardIds: Set<string>,
  options: {
    initiallyActive?: boolean;
    resetKey?: string;
  } = {},
): FrozenScraperUnseenFilter {
  const { initiallyActive = false, resetKey = "" } = options;
  const [active, setActiveState] = useState(initiallyActive);
  const [recordsSnapshot, setRecordsSnapshot] = useState<Map<
    string,
    ScraperViewHistoryRecord
  > | null>(null);
  const liveRecordsRef = useRef(liveRecordsById);
  const activeRef = useRef(active);
  const previousResetKeyRef = useRef(resetKey);

  liveRecordsRef.current = liveRecordsById;
  activeRef.current = active;

  const setActive = useCallback((nextActive: boolean) => {
    setActiveState(nextActive);
    setRecordsSnapshot(nextActive ? new Map(liveRecordsRef.current) : null);
  }, []);

  useEffect(() => {
    if (previousResetKeyRef.current === resetKey) {
      return;
    }

    previousResetKeyRef.current = resetKey;
    setRecordsSnapshot(activeRef.current ? new Map(liveRecordsRef.current) : null);
  }, [resetKey]);

  return {
    active,
    recordsById: recordsSnapshot ?? liveRecordsById,
    newCardIds: recordsSnapshot ? EMPTY_CARD_IDS : currentListNewCardIds,
    setActive,
  };
}
