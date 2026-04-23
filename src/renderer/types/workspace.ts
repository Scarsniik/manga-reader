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
  | ScraperConfigWorkspaceTarget
  | ScraperDetailsWorkspaceTarget
  | ScraperAuthorWorkspaceTarget;

export type WorkspaceTab = {
  id: string;
  target: WorkspaceTarget;
  title: string;
};
