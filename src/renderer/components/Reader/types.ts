import { Manga } from '@/renderer/types';
import { ScraperBookmarkMetadataField } from '@/shared/scraper';
import {
    ScraperRuntimeChapterResult,
    ScraperRuntimeDetailsResult,
} from '@/renderer/utils/scraperRuntime';
import { ScraperBrowserReturnState } from '@/renderer/components/ScraperBrowser/types';

export type ReaderLocationState = {
    from?: {
        pathname: string;
        search?: string;
    };
    mangaId?: string;
    scraperBrowserReturn?: ScraperBrowserReturnState;
    scraperReader?: {
        id: string;
        scraperId: string;
        title: string;
        sourceUrl: string;
        cover?: string;
        pageUrls: string[];
        chapter?: ScraperRuntimeChapterResult;
        bookmarkExcludedFields?: ScraperBookmarkMetadataField[];
        ignoreSavedProgress?: boolean;
    };
} | null;

export type ReaderOcrBox = {
    id: string;
    text: string;
    bbox: { x: number; y: number; w: number; h: number };
    vertical?: boolean;
    lines?: string[];
    manual?: boolean;
};

export type ReaderOcrLoadResult = {
    boxes: ReaderOcrBox[];
    fromCache: boolean;
    computedAt: string | null;
    forceRefreshUsed: boolean;
    source?: string | null;
};

export type ManualSelection = {
    x: number;
    y: number;
    w: number;
    h: number;
};

export type OcrNavigationDirection = 'up' | 'left' | 'down' | 'right';

export type ReaderAdjacentTarget = {
    kind: 'library' | 'scraper';
    title: string;
    chapterLabel?: string | null;
    cover?: string | null;
    adjacentManga?: Manga;
    adjacentChapter?: ScraperRuntimeChapterResult;
    detailsResult?: ScraperRuntimeDetailsResult;
    scraperId?: string;
};

export type ReaderCopyFeedback = {
    type: 'success' | 'error';
    message: string;
};
