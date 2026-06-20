import type { ReaderWorkspaceTarget, ScraperDetailsWorkspaceTarget } from "@/renderer/types/workspace";

export type ReadingListItemMetadata = {
  title: string;
  cover?: string | null;
  authors?: string[];
  tags?: string[];
  languageCodes?: string[];
};

export type ReadingListItem = {
  id: string;
  metadata: ReadingListItemMetadata;
  sourceTarget: ReaderWorkspaceTarget | ScraperDetailsWorkspaceTarget;
};

export type ReadingListOptions = {
  randomOrder: boolean;
  removeBookmarkAfterReading: boolean;
  resumeProgress: boolean;
};

export type ReadingListItemStatus = {
  bookmarkRemoved: boolean;
  bookmarkRemovalError?: string | null;
  completed: boolean;
};
