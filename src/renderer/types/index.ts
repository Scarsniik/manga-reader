export interface Link {
    url: string;
    title: string;
    description?: string;
    createdAt: Date;
}

export type LinksList = Link[];

export interface Author {
    id: string;
    name: string;
    createdAt: string; // ISO date
}

export interface Tag {
    id: string;
    name: string;
    hidden?: boolean;
    createdAt: string; // ISO date
}

export interface Series {
    id: string;
    title: string;
}

/**
 * Chapter represents the chapter number of a manga in a series.
 */
export interface Chapter {
    seriesId: string;
    number: number;
}

export interface Manga {
    id: string;
    title: string;
    path: string; // local filesystem path to the folder containing chapters
    thumbnailPath?: string | null;
    createdAt: string; // ISO date
    /** optional current open page (1-based). kept in sync from Reader */
    currentPage?: number | null;
    pages?: number | null;
    language?: string | null; // ISO 639-1 code
    authorIds: string[];
    tagIds: string[];
    seriesId?: string | null;
    chapters?: string;
    sourceKind?: 'library' | 'scraper';
    scraperId?: string | null;
    sourceUrl?: string | null;
    sourceChapterUrl?: string | null;
    sourceChapterLabel?: string | null;
}

export type LibrarySearchFilterState = {
    query: string;
    selectedTags: string[];
    selectedLanguageIds: string[];
    sortBy: string;
    expanded: boolean;
    statusFilter: string[];
    unfinishedFirst: boolean;
    withCompleteOcr: boolean;
    selectedAuthorId: string | null;
    selectedSeriesId: string | null;
};

export type SavedLibrarySearch = {
    id: string;
    name: string;
    filters: LibrarySearchFilterState;
    createdAt: string;
};

export type MangasList = Manga[];
export type AuthorsList = Author[];
export type TagsList = Tag[];
