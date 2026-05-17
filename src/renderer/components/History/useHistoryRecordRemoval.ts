import { useCallback, type Dispatch, type SetStateAction } from "react";
import type {
  AppHistoryRecords,
  DetailsHistoryRecord,
  ReadingHistoryRecord,
  SearchHistoryRecord,
} from "@/shared/history";

type Options = {
  setHistoryRecords: Dispatch<SetStateAction<AppHistoryRecords>>;
  setBusyRecordId: Dispatch<SetStateAction<string | null>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
};

type RemoveRecordOptions = {
  recordId: string;
  apiMethodName: string;
  successMessage: string;
  errorMessage: string;
};

const getHistoryApi = (): any => (
  typeof window !== "undefined" ? (window as any).api : null
);

export const useHistoryRecordRemoval = ({
  setHistoryRecords,
  setBusyRecordId,
  setMessage,
  setError,
}: Options) => {
  const removeRecord = useCallback(async ({
    recordId,
    apiMethodName,
    successMessage,
    errorMessage,
  }: RemoveRecordOptions) => {
    const api = getHistoryApi();
    const removeHistoryRecord = api?.[apiMethodName];
    if (typeof removeHistoryRecord !== "function") {
      return;
    }

    setBusyRecordId(recordId);
    setError(null);
    setMessage(null);
    try {
      const records = await removeHistoryRecord(recordId);
      setHistoryRecords(records as AppHistoryRecords);
      setMessage(successMessage);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : errorMessage);
    } finally {
      setBusyRecordId(null);
    }
  }, [setBusyRecordId, setError, setHistoryRecords, setMessage]);

  const removeReadingRecord = useCallback((record: ReadingHistoryRecord) => (
    removeRecord({
      recordId: record.id,
      apiMethodName: "removeReadingHistoryRecord",
      successMessage: "Entree retiree de l'historique.",
      errorMessage: "Impossible de supprimer cette entree.",
    })
  ), [removeRecord]);

  const removeDetailsRecord = useCallback((record: DetailsHistoryRecord) => (
    removeRecord({
      recordId: record.id,
      apiMethodName: "removeDetailsHistoryRecord",
      successMessage: "Fiche retiree de l'historique.",
      errorMessage: "Impossible de supprimer cette fiche de l'historique.",
    })
  ), [removeRecord]);

  const removeSearchRecord = useCallback((record: SearchHistoryRecord) => (
    removeRecord({
      recordId: record.id,
      apiMethodName: "removeSearchHistoryRecord",
      successMessage: "Recherche retiree de l'historique.",
      errorMessage: "Impossible de supprimer cette recherche de l'historique.",
    })
  ), [removeRecord]);

  return {
    removeReadingRecord,
    removeDetailsRecord,
    removeSearchRecord,
  };
};
