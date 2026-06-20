import type { ReaderLocationState } from "@/renderer/components/Reader/types";
import type { ReaderWorkspaceTarget, WorkspaceTarget } from "@/renderer/types/workspace";

type WorkspaceApi = {
  openWorkspaceTarget?: (
    target: WorkspaceTarget,
    options?: WorkspaceOpenTargetOptions,
  ) => Promise<boolean>;
};

export type WorkspaceOpenTargetOptions = {
  activate?: boolean;
};

type ReaderTargetOptions = {
  mangaId: string;
  page: number;
  title?: string | null;
  locationState?: ReaderLocationState;
};

const getWorkspaceApi = (): WorkspaceApi => (
  (window.api ?? {}) as WorkspaceApi
);

export const buildReaderSearch = (mangaId: string, page: number): string => (
  `?id=${encodeURIComponent(mangaId)}&page=${encodeURIComponent(String(page))}`
);

export const buildReaderPath = (mangaId: string, page: number): string => (
  `/reader${buildReaderSearch(mangaId, page)}`
);

export const buildReaderWorkspaceTarget = ({
  mangaId,
  page,
  title,
  locationState,
}: ReaderTargetOptions): ReaderWorkspaceTarget => ({
  kind: "reader",
  mangaId,
  page,
  title: title?.trim() || undefined,
  locationState,
});

export const openWorkspaceTarget = async (
  target: WorkspaceTarget,
  options?: WorkspaceOpenTargetOptions,
): Promise<boolean> => {
  const api = getWorkspaceApi();

  if (typeof api.openWorkspaceTarget !== "function") {
    return false;
  }

  return api.openWorkspaceTarget(target, options);
};

export const openReaderWorkspaceTarget = async (options: ReaderTargetOptions): Promise<boolean> => (
  openWorkspaceTarget(buildReaderWorkspaceTarget(options))
);
