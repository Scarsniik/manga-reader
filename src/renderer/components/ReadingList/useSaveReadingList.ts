import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReadingListItem } from "@/renderer/types/readingList";

type ReadingListSaveState = {
  error: string | null;
  save: () => Promise<void>;
  saved: boolean;
  saving: boolean;
};

const getItemsSignature = (items: ReadingListItem[]): string => JSON.stringify(items);

export default function useSaveReadingList(
  items: ReadingListItem[],
  initialSavedListId?: string,
): ReadingListSaveState {
  const itemsSignature = useMemo(() => getItemsSignature(items), [items]);
  const [savedItemsSignature, setSavedItemsSignature] = useState<string | null>(() => (
    initialSavedListId ? itemsSignature : null
  ));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestInFlightRef = useRef(false);
  const savedListIdRef = useRef(initialSavedListId);
  const initialSavedListIdRef = useRef(initialSavedListId);
  const saved = savedItemsSignature === itemsSignature;

  useEffect(() => {
    if (initialSavedListIdRef.current === initialSavedListId) {
      return;
    }

    initialSavedListIdRef.current = initialSavedListId;
    savedListIdRef.current = initialSavedListId;
    setSavedItemsSignature(initialSavedListId ? itemsSignature : null);
  }, [initialSavedListId, itemsSignature]);

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
      const requestItemsSignature = itemsSignature;
      const requestedSavedListId = savedListIdRef.current;
      const savedList = await window.api.saveReadingList({
        items,
        ...(requestedSavedListId ? { savedListId: requestedSavedListId } : {}),
      });
      savedListIdRef.current = savedList.id;
      setSavedItemsSignature(requestItemsSignature);
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
