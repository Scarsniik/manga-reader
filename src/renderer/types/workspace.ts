import type { ReaderLocationState } from "@/renderer/components/Reader/types";

export type MangaManagerViewWorkspaceTarget = {
  kind: "manga-manager.view";
  viewId: string;
  locationState?: {
    librarySearchQuery?: string;
    multiSearchPrefillQuery?: string;
  };
  title?: string;
};

export type ReaderWorkspaceTarget = {
  kind: "reader";
  mangaId: string;
  page?: number;
  title?: string;
  locationState?: ReaderLocationState;
};

export type ScraperConfigWorkspaceTarget = {
  kind: "scraper.config";
  scraperId: string;
  title?: string;
};

export type ScraperDetailsWorkspaceTarget = {
  kind: "scraper.details";
  scraperId: string;
  sourceUrl: string;
  title?: string;
};

export type ScraperAuthorWorkspaceTarget = {
  kind: "scraper.author";
  scraperId: string;
  query: string;
  title?: string;
  templateContext?: Record<string, string | undefined>;
};

export type ScraperTagWorkspaceTarget = {
  kind: "scraper.tag";
  scraperId: string;
  query: string;
  title?: string;
};

export type WorkspaceTarget =
  | MangaManagerViewWorkspaceTarget
  | ReaderWorkspaceTarget
  | ScraperConfigWorkspaceTarget
  | ScraperDetailsWorkspaceTarget
  | ScraperAuthorWorkspaceTarget
  | ScraperTagWorkspaceTarget;

export type WorkspaceTab = {
  id: string;
  isNew?: boolean;
  returnTarget?: WorkspaceTarget;
  target: WorkspaceTarget;
  title: string;
};
