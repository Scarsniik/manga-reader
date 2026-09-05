import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReadingListItem } from "@/renderer/types/readingList";

type ReadingListSaveState = {
  error: string | null;
  save: () => Promise<void>;
  saved: boolean;
  saving: boolean;
};

const getReadingListSignature = (name: string, items: ReadingListItem[]): string => JSON.stringify({
  items,
  name: name.trim(),
});

export default function useSaveReadingList(
  items: ReadingListItem[],
  name: string,
  initialSavedListId?: string,
): ReadingListSaveState {
  const readingListSignature = useMemo(
    () => getReadingListSignature(name, items),
    [items, name],
  );
  const [savedReadingListSignature, setSavedReadingListSignature] = useState<string | null>(() => (
    initialSavedListId ? readingListSignature : null
  ));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestInFlightRef = useRef(false);
  const savedListIdRef = useRef(initialSavedListId);
  const initialSavedListIdRef = useRef(initialSavedListId);
  const saved = savedReadingListSignature === readingListSignature;

  useEffect(() => {
    if (initialSavedListIdRef.current === initialSavedListId) {
      return;
    }

    initialSavedListIdRef.current = initialSavedListId;
    savedListIdRef.current = initialSavedListId;
    setSavedReadingListSignature(initialSavedListId ? readingListSignature : null);
  }, [initialSavedListId, readingListSignature]);

  useEffect(() => {
    setError(null);
  }, [readingListSignature]);

  const save = useCallback(async () => {
    if (items.length === 0 || saved || requestInFlightRef.current) {
      return;
    }

    const normalizedName = name.trim();
    if (!normalizedName) {
      setError("Donnez un nom à la liste de lecture.");
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
      const requestReadingListSignature = readingListSignature;
      const requestedSavedListId = savedListIdRef.current;
      const savedList = await window.api.saveReadingList({
        name: normalizedName,
        items,
        ...(requestedSavedListId ? { savedListId: requestedSavedListId } : {}),
      });
      savedListIdRef.current = savedList.id;
      setSavedReadingListSignature(requestReadingListSignature);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Impossible d'enregistrer la liste.");
    } finally {
      requestInFlightRef.current = false;
      setSaving(false);
    }
  }, [items, name, readingListSignature, saved]);

  return {
    error,
    save,
    saved,
    saving,
  };
}
