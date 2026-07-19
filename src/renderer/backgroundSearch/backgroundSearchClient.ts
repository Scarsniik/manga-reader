import type {
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
}: {
  input: TInput;
  kind: BackgroundSearchKind;
  params: AppParams | null | undefined;
  primaryTerm: string;
  title: string;
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
  };
  return api.createBackgroundSearch(request);
};

