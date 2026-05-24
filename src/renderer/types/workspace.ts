import type { ReaderLocationState } from "@/renderer/components/Reader/types";

export type MangaManagerViewWorkspaceTarget = {
  kind: "manga-manager.view";
  viewId: string;
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

export type WorkspaceTarget =
  | MangaManagerViewWorkspaceTarget
  | ReaderWorkspaceTarget
  | ScraperConfigWorkspaceTarget
  | ScraperDetailsWorkspaceTarget
  | ScraperAuthorWorkspaceTarget;

export type WorkspaceTab = {
  id: string;
  isNew?: boolean;
  target: WorkspaceTarget;
  title: string;
};
