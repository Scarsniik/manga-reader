import type {
  BackgroundSearchRelation,
  BackgroundSearchJobMetadata,
  BackgroundSearchKind,
  BackgroundSearchStorageMode,
  CreateBackgroundSearchRequest,
} from "@/shared/backgroundSearch";
import type { AppParams } from "@/renderer/hooks/useParams";

export const getBackgroundSearchStorageSettings = (params: AppParams | null | undefined): {
  storageMode: BackgroundSearchStorageMode;
  retentionHours: number;
} => ({
  storageMode: params?.backgroundSearchStorageMode === "temporaryFile" ? "temporaryFile" : "memory",
  retentionHours: Math.max(1, Math.floor(params?.backgroundSearchTemporaryRetentionHours ?? 24)),
});

export const enqueueBackgroundSearch = async <TInput>({
  input,
  kind,
  params,
  primaryTerm,
  title,
  relation,
}: {
  input: TInput;
  kind: BackgroundSearchKind;
  params: AppParams | null | undefined;
  primaryTerm: string;
  title: string;
  relation?: Omit<BackgroundSearchRelation, "automationStatus">;
}): Promise<BackgroundSearchJobMetadata> => {
  const api = window.api ?? {};
  if (typeof api.createBackgroundSearch !== "function") {
    throw new Error("Le gestionnaire de recherches en arriere-plan n'est pas disponible.");
  }
  const storage = getBackgroundSearchStorageSettings(params);
  const request: CreateBackgroundSearchRequest<TInput> = {
    input,
    kind,
    title,
    primaryTerm,
    ...storage,
    ...(relation ? { relation } : {}),
  };
  return api.createBackgroundSearch(request);
};

export const createPrefilledBackgroundSearch = async <TInput, TResult>({
  input,
  kind,
  params,
  primaryTerm,
  result,
  resultCount,
  title,
}: {
  input: TInput;
  kind: BackgroundSearchKind;
  params: AppParams | null | undefined;
  primaryTerm: string;
  result: TResult;
  resultCount: number;
  title: string;
}): Promise<BackgroundSearchJobMetadata> => {
  const api = window.api ?? {};
  if (typeof api.createBackgroundSearch !== "function") {
    throw new Error("Le gestionnaire de recherches en arriere-plan n'est pas disponible.");
  }
  const storage = getBackgroundSearchStorageSettings(params);
  const request: CreateBackgroundSearchRequest<TInput, TResult> = {
    input,
    kind,
    title,
    primaryTerm,
    ...storage,
    initialResult: result,
    initialProgress: {
      completedUnits: 0,
      totalUnits: 0,
      resultCount: Math.max(0, Math.floor(resultCount)),
      currentLabel: "Vue préremplie depuis les résultats auteur",
    },
  };
  return api.createBackgroundSearch(request);
};
