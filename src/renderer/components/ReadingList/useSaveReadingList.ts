import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReadingListItem } from "@/renderer/types/readingList";

type ReadingListSaveState = {
  error: string | null;
  save: () => Promise<void>;
  saved: boolean;
  saving: boolean;
};

const getItemsSignature = (items: ReadingListItem[]): string => JSON.stringify(items);

export default function useSaveReadingList(items: ReadingListItem[]): ReadingListSaveState {
  const itemsSignature = useMemo(() => getItemsSignature(items), [items]);
  const [savedItemsSignature, setSavedItemsSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestInFlightRef = useRef(false);
  const saved = savedItemsSignature === itemsSignature;

  useEffect(() => {
    setError(null);
  }, [itemsSignature]);

  const save = useCallback(async () => {
    if (items.length === 0 || saved || requestInFlightRef.current) {
      return;
    }

    if (!window.api || typeof window.api.saveReadingList !== "function") {
      setError("L'enregistrement des listes est indisponible.");
      return;
    }

    requestInFlightRef.current = true;
    setSaving(true);
    setError(null);

    try {
      await window.api.saveReadingList({ items });
      setSavedItemsSignature(itemsSignature);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Impossible d'enregistrer la liste.");
    } finally {
      requestInFlightRef.current = false;
      setSaving(false);
    }
  }, [items, itemsSignature, saved]);

  return {
    error,
    save,
    saved,
    saving,
  };
}
