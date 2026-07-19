import type { BackgroundSearchJob, ListingBackgroundInput } from "@/shared/backgroundSearch";
import type { MangaManagerViewWorkspaceTarget } from "@/renderer/types/workspace";
import {
  SCRAPER_AUTHOR_FAVORITES_VIEW_ID,
  SCRAPER_CORRESPONDENCE_VIEW_ID,
  SCRAPER_LATEST_VIEW_ID,
  SCRAPER_MULTI_SEARCH_VIEW_ID,
} from "@/renderer/utils/scraperBrowserNavigation";

export const BACKGROUND_SEARCH_OPEN_EVENT = "background-search-open";
const PENDING_BACKGROUND_SEARCH_JOB_KEY = "manga-helper.background-search.pending-open.v1";

export const getBackgroundSearchViewId = (job: BackgroundSearchJob): string => {
  if (job.metadata.kind === "mangaCorrespondence") return SCRAPER_CORRESPONDENCE_VIEW_ID;
  if (job.metadata.kind === "multiSearch") return SCRAPER_MULTI_SEARCH_VIEW_ID;
  if (job.metadata.kind === "latestSources" || job.metadata.kind === "latestAuthors") return SCRAPER_LATEST_VIEW_ID;
  if (job.metadata.kind === "authorFavoriteRefresh") return SCRAPER_AUTHOR_FAVORITES_VIEW_ID;
  const input = job.input as ListingBackgroundInput;
  return input.sources?.[0]?.scraper.id || SCRAPER_AUTHOR_FAVORITES_VIEW_ID;
};

export const buildBackgroundSearchWorkspaceTarget = (
  job: BackgroundSearchJob,
): MangaManagerViewWorkspaceTarget => ({
  kind: "manga-manager.view",
  viewId: getBackgroundSearchViewId(job),
  title: job.metadata.title,
  locationState: {
    backgroundSearchJobId: job.metadata.id,
  },
});

export const requestBackgroundSearchOpenInCurrentView = (job: BackgroundSearchJob): void => {
  window.dispatchEvent(new CustomEvent(BACKGROUND_SEARCH_OPEN_EVENT, { detail: { job } }));
};

export const queuePendingBackgroundSearchOpen = (jobId: string): void => {
  window.sessionStorage.setItem(PENDING_BACKGROUND_SEARCH_JOB_KEY, jobId);
};

export const consumePendingBackgroundSearchOpen = (): string | null => {
  const jobId = window.sessionStorage.getItem(PENDING_BACKGROUND_SEARCH_JOB_KEY);
  window.sessionStorage.removeItem(PENDING_BACKGROUND_SEARCH_JOB_KEY);
  return jobId;
};
