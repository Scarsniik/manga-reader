import { readWorkspaceBrowserTabCache } from "@/renderer/components/Workspace/workspaceBrowserTabCache";
import type { ReadingListItem } from "@/renderer/types/readingList";
import type { WorkspaceTab } from "@/renderer/types/workspace";
import type { ScraperBookmarkRecord } from "@/shared/scraper";
import generateId from "@/utils/id";

export const isReadingListSourceTab = (tab: WorkspaceTab): boolean => (
  tab.target.kind === "reader" || tab.target.kind === "scraper.details"
);

export const buildReadingListItemFromTab = (tab: WorkspaceTab): ReadingListItem | null => {
  if (tab.target.kind === "reader") {
    const details = tab.target.locationState?.scraperBrowserReturn?.detailsResult;
    const scraperReader = tab.target.locationState?.scraperReader;

    return {
      id: generateId(),
      metadata: {
        title: tab.target.title?.trim() || scraperReader?.title?.trim() || tab.title,
        cover: scraperReader?.cover || details?.cover || null,
        authors: details?.authors ?? [],
        tags: details?.tags ?? [],
        languageCodes: details?.languageCodes ?? (scraperReader?.language ? [scraperReader.language] : []),
      },
      sourceTarget: tab.target,
    };
  }

  if (tab.target.kind === "scraper.details") {
    const targetKey = `scraper.details:${tab.target.scraperId}:${tab.target.sourceUrl}`;
    const cachedEntry = readWorkspaceBrowserTabCache(tab.id, targetKey);
    const details = cachedEntry?.initialState.detailsResult;
    const canonicalSourceUrl = details?.finalUrl || details?.requestedUrl || tab.target.sourceUrl;

    return {
      id: generateId(),
      metadata: {
        title: details?.title?.trim() || tab.target.title?.trim() || tab.title,
        cover: details?.cover || null,
        authors: details?.authors ?? [],
        tags: details?.tags ?? [],
        languageCodes: details?.languageCodes ?? [],
      },
      sourceTarget: {
        ...tab.target,
        sourceUrl: canonicalSourceUrl,
      },
    };
  }

  return null;
};

export const shuffleReadingListItems = (items: ReadingListItem[]): ReadingListItem[] => {
  const shuffledItems = [...items];

  for (let index = shuffledItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffledItems[index], shuffledItems[swapIndex]] = [shuffledItems[swapIndex], shuffledItems[index]];
  }

  return shuffledItems;
};

export const buildReadingListItemFromBookmark = (
  bookmark: ScraperBookmarkRecord,
): ReadingListItem => ({
  id: generateId(),
  metadata: {
    title: bookmark.title,
    cover: bookmark.cover || null,
    authors: bookmark.authors,
    tags: bookmark.tags,
    languageCodes: bookmark.languageCodes ?? [],
  },
  sourceTarget: {
    kind: "scraper.details",
    scraperId: bookmark.scraperId,
    sourceUrl: bookmark.sourceUrl,
    title: bookmark.title,
  },
});
