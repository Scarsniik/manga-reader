import React, { useMemo, useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Manga } from '@/renderer/types';
import useTags from '@/renderer/hooks/useTags';
import { Field } from '@/renderer/components/utils/Form/types';
import useParams from '@/renderer/hooks/useParams';
import { ChevronDownIcon, MagnifyingGlassIcon } from '@/renderer/components/icons';
import './styles.scss';
import SeriesField from '@/renderer/components/utils/Form/fields/SeriesField';
import AuthorField from '@/renderer/components/utils/Form/fields/AuthorField';
import EntityPickerField, { EntityOption } from '@/renderer/components/utils/Form/fields/EntityPickerField';
import { languages } from '@/renderer/consts/languages';

type Props = {
    mangaList: Manga[];
    onSearch: (result: Manga[]) => void;
    defaultSort?: string;
    defaultSearch?: string;
};

type MangaListFilterState = {
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

const EMPTY_LANGUAGE_TOKEN = '__none__';

function buildDefaultFilters(defaultSort: string, defaultSearch: string): MangaListFilterState {
    return {
        query: defaultSearch,
        selectedTags: [],
        selectedLanguageIds: [],
        sortBy: defaultSort,
        expanded: false,
        statusFilter: [],
        unfinishedFirst: false,
        withCompleteOcr: false,
        selectedAuthorId: null,
        selectedSeriesId: null,
    };
}

function sanitizeStringArray(value: unknown, allowEmpty = false): string[] {
    if (!Array.isArray(value)) return [];

    return value
        .map(item => (typeof item === 'string' ? item : item == null ? '' : String(item)))
        .filter(item => allowEmpty ? item === '' || item.trim().length > 0 : item.trim().length > 0);
}

function decodeArrayParam(value: string | null, emptyToken?: string): string[] {
    if (!value) return [];

    return value
        .split(',')
        .map(item => item.trim())
        .filter(item => item.length > 0)
        .map(item => (emptyToken && item === emptyToken ? '' : item));
}

function encodeArrayParam(values: string[], emptyToken?: string): string {
    return values
        .map(value => (emptyToken && value === '' ? emptyToken : value))
        .filter(value => value.length > 0)
        .join(',');
}

function toPositiveNumber(value: unknown): number | null {
    if (value == null) return null;

    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return null;

    return num;
}

function getReadingStatus(currentPageValue: unknown, pagesValue: unknown): 'Lu' | 'En cours' | 'Non lu' {
    const currentPage = toPositiveNumber(currentPageValue);
    const pages = toPositiveNumber(pagesValue);

    if (currentPage === null) {
        return 'Non lu';
    }

    if (pages !== null && currentPage !== null && currentPage >= pages) {
        return 'Lu';
    }

    if (currentPage > 1 && (pages === null || currentPage < pages)) {
        return 'En cours';
    }

    return 'Non lu';
}

function normalizePersistedFilters(
    value: unknown,
    defaultSort: string,
    defaultSearch: string,
): MangaListFilterState {
    const defaults = buildDefaultFilters(defaultSort, defaultSearch);
    if (!value || typeof value !== 'object') return defaults;

    const data = value as Record<string, unknown>;

    return {
        query: typeof data.query === 'string' ? data.query : defaults.query,
        selectedTags: sanitizeStringArray(data.selectedTags),
        selectedLanguageIds: sanitizeStringArray(data.selectedLanguageIds, true),
        sortBy: typeof data.sortBy === 'string' && data.sortBy.trim().length > 0 ? data.sortBy : defaults.sortBy,
        expanded: data.expanded === true,
        statusFilter: sanitizeStringArray(data.statusFilter),
        unfinishedFirst: data.unfinishedFirst === true,
        withCompleteOcr: data.withCompleteOcr === true,
        selectedAuthorId: typeof data.selectedAuthorId === 'string' && data.selectedAuthorId.trim().length > 0
            ? data.selectedAuthorId
            : null,
        selectedSeriesId: typeof data.selectedSeriesId === 'string' && data.selectedSeriesId.trim().length > 0
            ? data.selectedSeriesId
            : null,
    };
}

function parseFiltersFromSearch(search: string, defaultSort: string, defaultSearch: string) {
    const defaults = buildDefaultFilters(defaultSort, defaultSearch);

    try {
        const normalizedSearch = search.startsWith('?') ? search.slice(1) : search;
        const qs = new URLSearchParams(normalizedSearch);
        const hasUrlFilters = ['q', 'tags', 'sort', 'language', 'status', 'unfinished', 'ocrComplete', 'author', 'series']
            .some(key => qs.has(key));

        return {
            hasUrlFilters,
            filters: {
                query: qs.get('q') ?? defaults.query,
                selectedTags: decodeArrayParam(qs.get('tags')),
                selectedLanguageIds: decodeArrayParam(qs.get('language'), EMPTY_LANGUAGE_TOKEN),
                sortBy: qs.get('sort') ?? defaults.sortBy,
                expanded: qs.get('expanded') === '1',
                statusFilter: decodeArrayParam(qs.get('status')),
                unfinishedFirst: qs.get('unfinished') === '1',
                withCompleteOcr: qs.get('ocrComplete') === '1',
                selectedAuthorId: qs.get('author') || null,
                selectedSeriesId: qs.get('series') || null,
            } as MangaListFilterState,
        };
    } catch (e) {
        return { hasUrlFilters: false, filters: defaults };
    }
}

function serializeUrlManagedFilters(state: {
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
}) {
    return JSON.stringify({
        query: state.query,
        selectedTags: state.selectedTags,
        selectedLanguageIds: state.selectedLanguageIds,
        sortBy: state.sortBy,
        expanded: state.expanded,
        statusFilter: state.statusFilter,
        unfinishedFirst: state.unfinishedFirst,
        withCompleteOcr: state.withCompleteOcr,
        selectedAuthorId: state.selectedAuthorId,
        selectedSeriesId: state.selectedSeriesId,
    });
}

const SearchAndSort: React.FC<Props> = ({ mangaList = [], onSearch, defaultSort = 'date-desc', defaultSearch = '' }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const { tags } = useTags();
    const { params, loading, setParams } = useParams();
    const persistMangaFilters = params?.persistMangaFilters !== false;
    const hideHiddenTags = params?.showHiddens === false || params?.showHiddens === undefined;

    // Cache for page counts that are computed asynchronously by backend (like MangaCard)
    const pagesCacheRef = React.useRef<Record<string, number | null | undefined>>({});
    const ocrCompletionCacheRef = React.useRef<Record<string, boolean | undefined>>({});
    const [pagesVersion, setPagesVersion] = useState<number>(0);
    const [ocrCompletionVersion, setOcrCompletionVersion] = useState<number>(0);
    const initialUrlStateRef = React.useRef(parseFiltersFromSearch(location.search, defaultSort, defaultSearch));
    const hydratedFiltersRef = React.useRef(false);
    const pendingHydrationTargetRef = useRef<string | null>(null);
    const previousPersistSettingRef = React.useRef(persistMangaFilters);
    const lastPersistedSnapshotRef = React.useRef<string | null>(null);
    const pendingPersistTimeoutRef = useRef<number | null>(null);
    const latestPersistedFilterSnapshotRef = useRef<MangaListFilterState | null>(null);
    const latestParamsRef = useRef<typeof params>(params);
    const lastObservedLocationSearchRef = useRef(location.search);
    const previousLocationSearchRef = useRef(location.search);
    const [filtersHydrated, setFiltersHydrated] = useState(false);

    const [query, setQuery] = useState<string>(initialUrlStateRef.current.filters.query);
    const [selectedTags, setSelectedTags] = useState<string[]>(initialUrlStateRef.current.filters.selectedTags);
    const [selectedLanguageIds, setSelectedLanguageIds] = useState<string[]>(initialUrlStateRef.current.filters.selectedLanguageIds);
    const [sortBy, setSortBy] = useState<string>(initialUrlStateRef.current.filters.sortBy);
    const [expanded, setExpanded] = useState<boolean>(initialUrlStateRef.current.filters.expanded);
    const [statusFilter, setStatusFilter] = useState<string[]>(initialUrlStateRef.current.filters.statusFilter);
    const [unfinishedFirst, setUnfinishedFirst] = useState<boolean>(initialUrlStateRef.current.filters.unfinishedFirst);
    const [withCompleteOcr, setWithCompleteOcr] = useState<boolean>(initialUrlStateRef.current.filters.withCompleteOcr);
    const [selectedAuthorId, setSelectedAuthorId] = useState<string | null>(initialUrlStateRef.current.filters.selectedAuthorId);
    const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(initialUrlStateRef.current.filters.selectedSeriesId);
    const availableTags = useMemo(
        () => hideHiddenTags ? tags.filter(tag => !tag.hidden) : tags,
        [hideHiddenTags, tags],
    );

    const availableTagIds = useMemo(
        () => new Set(availableTags.map(tag => tag.id)),
        [availableTags],
    );

    const effectiveSelectedTags = useMemo(
        () => hideHiddenTags ? selectedTags.filter(tagId => availableTagIds.has(tagId)) : selectedTags,
        [availableTagIds, hideHiddenTags, selectedTags],
    );

    const applyFilterState = useCallback((state: MangaListFilterState) => {
        setQuery(state.query);
        setSelectedTags(state.selectedTags);
        setSelectedLanguageIds(state.selectedLanguageIds);
        setSortBy(state.sortBy);
        setExpanded(state.expanded);
        setStatusFilter(state.statusFilter);
        setUnfinishedFirst(state.unfinishedFirst);
        setWithCompleteOcr(state.withCompleteOcr);
        setSelectedAuthorId(state.selectedAuthorId);
        setSelectedSeriesId(state.selectedSeriesId);
    }, []);

    const normalizeUiFilterState = useCallback((state: MangaListFilterState): MangaListFilterState => ({
        ...state,
        selectedTags: hideHiddenTags ? state.selectedTags.filter(tagId => availableTagIds.has(tagId)) : state.selectedTags,
    }), [availableTagIds, hideHiddenTags]);

    const currentUiFilterState = useMemo<MangaListFilterState>(() => ({
        query,
        selectedTags,
        selectedLanguageIds,
        sortBy,
        expanded,
        statusFilter,
        unfinishedFirst,
        withCompleteOcr,
        selectedAuthorId,
        selectedSeriesId,
    }), [
        expanded,
        query,
        selectedAuthorId,
        selectedLanguageIds,
        selectedSeriesId,
        selectedTags,
        sortBy,
        statusFilter,
        unfinishedFirst,
        withCompleteOcr,
    ]);

    const parsedLocationFilterState = useMemo(
        () => parseFiltersFromSearch(location.search, defaultSort, defaultSearch).filters,
        [defaultSearch, defaultSort, location.search],
    );

    const normalizedLocationFilterState = useMemo(
        () => normalizeUiFilterState(parsedLocationFilterState),
        [normalizeUiFilterState, parsedLocationFilterState],
    );

    const currentUrlManagedFilterSnapshot = useMemo(
        () => serializeUrlManagedFilters({
            query,
            selectedTags: effectiveSelectedTags,
            selectedLanguageIds,
            sortBy,
            expanded,
            statusFilter,
            unfinishedFirst,
            withCompleteOcr,
            selectedAuthorId,
            selectedSeriesId,
        }),
        [
            expanded,
            effectiveSelectedTags,
            query,
            selectedLanguageIds,
            selectedAuthorId,
            selectedSeriesId,
            sortBy,
            statusFilter,
            unfinishedFirst,
            withCompleteOcr,
        ],
    );

    const locationUrlManagedFilterSnapshot = useMemo(
        () => serializeUrlManagedFilters({
            query: normalizedLocationFilterState.query,
            selectedTags: normalizedLocationFilterState.selectedTags,
            selectedLanguageIds: normalizedLocationFilterState.selectedLanguageIds,
            sortBy: normalizedLocationFilterState.sortBy,
            expanded: normalizedLocationFilterState.expanded,
            statusFilter: normalizedLocationFilterState.statusFilter,
            unfinishedFirst: normalizedLocationFilterState.unfinishedFirst,
            withCompleteOcr: normalizedLocationFilterState.withCompleteOcr,
            selectedAuthorId: normalizedLocationFilterState.selectedAuthorId,
            selectedSeriesId: normalizedLocationFilterState.selectedSeriesId,
        }),
        [normalizedLocationFilterState],
    );

    const shouldPauseUrlSync = previousLocationSearchRef.current !== location.search
        && currentUrlManagedFilterSnapshot !== locationUrlManagedFilterSnapshot;

    const persistedFilterSnapshot = useMemo<MangaListFilterState>(() => ({
        query,
        selectedTags: effectiveSelectedTags,
        selectedLanguageIds,
        sortBy,
        expanded: false,
        statusFilter,
        unfinishedFirst,
        withCompleteOcr,
        selectedAuthorId,
        selectedSeriesId,
    }), [
        effectiveSelectedTags,
        query,
        selectedLanguageIds,
        selectedAuthorId,
        selectedSeriesId,
        sortBy,
        statusFilter,
        unfinishedFirst,
        withCompleteOcr,
    ]);

    useEffect(() => {
        latestPersistedFilterSnapshotRef.current = persistedFilterSnapshot;
    }, [persistedFilterSnapshot]);

    useEffect(() => {
        latestParamsRef.current = params;
    }, [params]);

    useEffect(() => {
        const hasChanged = selectedTags.length !== effectiveSelectedTags.length
            || selectedTags.some((tagId, index) => effectiveSelectedTags[index] !== tagId);

        if (hasChanged) {
            setSelectedTags(effectiveSelectedTags);
        }
    }, [effectiveSelectedTags, selectedTags]);

    // Fetch page counts for mangas that don't have a pages value yet but have a path.
    useEffect(() => {
        if (!window || !(window as any).api || typeof (window as any).api.countPages !== 'function') return;
        (mangaList || []).forEach(m => {
            if (!m) return;
            const already = Object.prototype.hasOwnProperty.call(pagesCacheRef.current, m.id);
            if ((m.pages === undefined || m.pages === null) && m.path && !already) {
                // mark as fetching to avoid duplicate requests
                pagesCacheRef.current[m.id] = undefined;
                (window as any).api.countPages(m.path).then((count: number) => {
                    pagesCacheRef.current[m.id] = count;
                    setPagesVersion(v => v + 1);
                }).catch((err: any) => {
                    console.warn('countPages failed for', m.path, err);
                    pagesCacheRef.current[m.id] = null;
                    setPagesVersion(v => v + 1);
                });
            }
        });
    }, [mangaList]);

    useEffect(() => {
        if (!window || !(window as any).api || typeof (window as any).api.ocrGetMangaCompletionMap !== 'function') return;

        const mangaIds = (mangaList || [])
            .map(m => m?.id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0);

        if (mangaIds.length === 0) return;

        let cancelled = false;

        (async () => {
            try {
                const completionMap = await (window as any).api.ocrGetMangaCompletionMap(mangaIds);
                if (cancelled || !completionMap || typeof completionMap !== 'object') return;

                ocrCompletionCacheRef.current = {
                    ...ocrCompletionCacheRef.current,
                    ...completionMap,
                };
                setOcrCompletionVersion(v => v + 1);
            } catch (err) {
                console.warn('ocrGetMangaCompletionMap failed', err);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [mangaList]);

    useEffect(() => {
        if (loading || hydratedFiltersRef.current) return;

        let startingFilters = initialUrlStateRef.current.filters;

        if (!initialUrlStateRef.current.hasUrlFilters && persistMangaFilters && params?.mangaListFilters) {
            startingFilters = normalizePersistedFilters(params.mangaListFilters, defaultSort, defaultSearch);
        }

        const normalizedStartingFilters = normalizeUiFilterState(startingFilters);
        const serializedStartingFilters = JSON.stringify(normalizedStartingFilters);
        const serializedCurrentFilters = JSON.stringify(normalizeUiFilterState(currentUiFilterState));

        pendingHydrationTargetRef.current = serializedStartingFilters;
        lastPersistedSnapshotRef.current = JSON.stringify({
            ...normalizedStartingFilters,
            expanded: false,
        });
        hydratedFiltersRef.current = true;

        if (serializedCurrentFilters !== serializedStartingFilters) {
            applyFilterState(normalizedStartingFilters);
            return;
        }

        pendingHydrationTargetRef.current = null;
        setFiltersHydrated(true);
    }, [
        applyFilterState,
        currentUiFilterState,
        defaultSearch,
        defaultSort,
        loading,
        normalizeUiFilterState,
        params?.mangaListFilters,
        persistMangaFilters,
    ]);

    useEffect(() => {
        if (!hydratedFiltersRef.current || filtersHydrated) return;

        const targetSnapshot = pendingHydrationTargetRef.current;
        if (!targetSnapshot) return;

        const serializedCurrentFilters = JSON.stringify(normalizeUiFilterState(currentUiFilterState));
        if (serializedCurrentFilters !== targetSnapshot) return;

        pendingHydrationTargetRef.current = null;
        setFiltersHydrated(true);
    }, [currentUiFilterState, filtersHydrated, normalizeUiFilterState]);

    useEffect(() => {
        if (persistMangaFilters && !previousPersistSettingRef.current) {
            lastPersistedSnapshotRef.current = null;
        }
        previousPersistSettingRef.current = persistMangaFilters;
    }, [persistMangaFilters]);

    useEffect(() => {
        previousLocationSearchRef.current = location.search;
    }, [location.search]);

    useEffect(() => {
        if (!filtersHydrated) return;
        if (!hydratedFiltersRef.current) {
            lastObservedLocationSearchRef.current = location.search;
            return;
        }
        if (location.search === lastObservedLocationSearchRef.current) return;

        lastObservedLocationSearchRef.current = location.search;
        const next = parseFiltersFromSearch(location.search, defaultSort, defaultSearch).filters;
        applyFilterState(next);
    }, [applyFilterState, defaultSearch, defaultSort, filtersHydrated, location.search]);

    const tagSummary = useMemo(() => {
        if (!effectiveSelectedTags || effectiveSelectedTags.length === 0) return 'Aucune etiquette selectionnee';
        const names = effectiveSelectedTags.map(id => availableTags.find(t => t.id === id)?.name || id);
        return `Etiquettes : ${names.join(', ')}`;
    }, [availableTags, effectiveSelectedTags]);

    const activeAdvancedFilterCount = useMemo(() => {
        let total = 0;

        if (statusFilter.length > 0) total += statusFilter.length;
        if (effectiveSelectedTags.length > 0) total += effectiveSelectedTags.length;
        if (selectedLanguageIds.length > 0) total += selectedLanguageIds.length;
        if (selectedAuthorId) total += 1;
        if (selectedSeriesId) total += 1;
        if (unfinishedFirst) total += 1;
        if (withCompleteOcr) total += 1;
        if (sortBy !== defaultSort) total += 1;

        return total;
    }, [
        defaultSort,
        effectiveSelectedTags.length,
        selectedLanguageIds.length,
        selectedAuthorId,
        selectedSeriesId,
        sortBy,
        statusFilter.length,
        unfinishedFirst,
        withCompleteOcr,
    ]);

    const activeAdvancedFilterLabel = activeAdvancedFilterCount > 0
        ? `${activeAdvancedFilterCount} filtre${activeAdvancedFilterCount > 1 ? 's' : ''} actif${activeAdvancedFilterCount > 1 ? 's' : ''}`
        : 'Aucun filtre avance';

    const applyFilters = useCallback(() => {
        const searchLower = (query || '').trim().toLowerCase();

        let result = (mangaList || []).filter(m => {
            // respect params for hidden tags if provided
            if (params && (params.showHiddens === false || params.showHiddens === undefined)) {
                if (Array.isArray(m.tagIds) && m.tagIds.length > 0) {
                    const hasHidden = m.tagIds.some(tid => tags.find(t => t.id === tid && t.hidden));
                    if (hasHidden) return false;
                }
            }

            // series filter
            if (selectedSeriesId) {
                if (m.seriesId !== selectedSeriesId) return false;
            }

            if (selectedAuthorId) {
                if (!Array.isArray(m.authorIds) || !m.authorIds.includes(selectedAuthorId)) return false;
            }

            // language filter multi
            if (selectedLanguageIds && selectedLanguageIds.length > 0) {
                const hasAucune = selectedLanguageIds.includes('');
                const otherLangs = selectedLanguageIds.filter(l => l !== '');
                if (hasAucune && otherLangs.length === 0) {
                    // Uniquement "Aucune" : mangas sans langue définie
                    if (m.language !== undefined && m.language !== null && m.language !== '') return false;
                } else if (!hasAucune && otherLangs.length > 0) {
                    // Uniquement des langues précises
                    if (!m.language || !otherLangs.includes(m.language)) return false;
                } else if (hasAucune && otherLangs.length > 0) {
                    // "Aucune" + d'autres langues : on garde les mangas sans langue OU dans la liste
                    if ((m.language === undefined || m.language === null || m.language === '') || otherLangs.includes(m.language)) {
                        // ok
                    } else {
                        return false;
                    }
                }
            }

            if (searchLower) {
                const title = (m.title || '').toLowerCase();
                if (!title.includes(searchLower)) return false;
            }

            if (effectiveSelectedTags.length > 0) {
                // require manga to have all selected tags (AND semantics)
                if (!Array.isArray(m.tagIds)) return false;
                const hasAll = effectiveSelectedTags.every(tid => m.tagIds!.includes(tid));
                if (!hasAll) return false;
            }

            if (withCompleteOcr) {
                if (ocrCompletionCacheRef.current[m.id] !== true) return false;
            }

            // status filter: keep statuses mutually exclusive.
            // page 1 is considered "Non lu" unless it is also the last page.
            if (statusFilter && statusFilter.length > 0) {
                const pagesRaw = m.pages;
                const cpRaw = m.currentPage;
                const pagesCount = pagesRaw != null ? pagesRaw : (pagesCacheRef.current[m.id] ?? undefined);
                const readingStatus = getReadingStatus(cpRaw, pagesCount);

                // Si plusieurs statuts sélectionnés, on garde si l'un d'eux correspond
                const match = statusFilter.some(status => status === readingStatus);
                if (!match) return false;
            }

            return true;
        });

        // sort
        result = result.slice();
        switch (sortBy) {
            case 'title-asc':
                result.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
                break;
            case 'title-desc':
                result.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
                break;
            case 'date-asc':
                result.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
                break;
            case 'date-desc':
            default:
                result.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
                break;
        }

        if (unfinishedFirst) {
            // Promote mangas that are actually "En cours" using the same status logic as filters.
            result = result.slice().sort((a, b) => {
                const aPagesRaw = a.pages;
                const bPagesRaw = b.pages;
                const aPages = aPagesRaw != null ? aPagesRaw : (pagesCacheRef.current[a.id] ?? undefined);
                const bPages = bPagesRaw != null ? bPagesRaw : (pagesCacheRef.current[b.id] ?? undefined);

                const aInProgress = getReadingStatus(a.currentPage, aPages) === 'En cours';
                const bInProgress = getReadingStatus(b.currentPage, bPages) === 'En cours';
                if (aInProgress === bInProgress) return 0; // preserve relative order for same status
                return aInProgress ? -1 : 1; // in-progress first
            });
        }

        onSearch(result);
    }, [
        mangaList,
        onSearch,
        ocrCompletionVersion,
        pagesVersion,
        params,
        query,
        selectedLanguageIds,
        selectedAuthorId,
        selectedSeriesId,
        sortBy,
        statusFilter,
        tags,
        effectiveSelectedTags,
        unfinishedFirst,
        withCompleteOcr,
    ]);

    // trigger search whenever input state changes
    useEffect(() => {
        if (!filtersHydrated) return;
        applyFilters();
    }, [applyFilters, filtersHydrated]);

    // Keep route search in sync with filters so HashRouter navigation preserves them.
    useLayoutEffect(() => {
        if (!filtersHydrated) return;
        if (shouldPauseUrlSync) return;
        try {
            const qs = new URLSearchParams(location.search.startsWith('?') ? location.search.slice(1) : location.search);
            if (query) qs.set('q', query); else qs.delete('q');
            if (effectiveSelectedTags.length > 0) qs.set('tags', encodeArrayParam(effectiveSelectedTags)); else qs.delete('tags');
            if (sortBy) qs.set('sort', sortBy); else qs.delete('sort');
            if (expanded) qs.set('expanded', '1'); else qs.delete('expanded');
            if (statusFilter.length > 0) qs.set('status', encodeArrayParam(statusFilter)); else qs.delete('status');
            if (selectedLanguageIds.length > 0) {
                qs.set('language', encodeArrayParam(selectedLanguageIds, EMPTY_LANGUAGE_TOKEN));
            } else {
                qs.delete('language');
            }
            if (unfinishedFirst) qs.set('unfinished', '1'); else qs.delete('unfinished');
            if (withCompleteOcr) qs.set('ocrComplete', '1'); else qs.delete('ocrComplete');
            if (selectedAuthorId) qs.set('author', selectedAuthorId); else qs.delete('author');
            if (selectedSeriesId) qs.set('series', selectedSeriesId); else qs.delete('series');
            const nextSearch = qs.toString();
            const normalizedNextSearch = nextSearch ? `?${nextSearch}` : '';

            if (location.search === normalizedNextSearch) {
                return;
            }

            navigate(
                {
                    pathname: location.pathname,
                    search: normalizedNextSearch,
                },
                { replace: true }
            );
        } catch (e) {
            console.warn('Failed to sync search params to URL', e);
        }
    }, [
        expanded,
        effectiveSelectedTags,
        filtersHydrated,
        location.pathname,
        location.search,
        navigate,
        query,
        selectedLanguageIds,
        selectedAuthorId,
        selectedSeriesId,
        sortBy,
        statusFilter,
        shouldPauseUrlSync,
        unfinishedFirst,
        withCompleteOcr,
    ]);

    // Persist filters in settings when the option is enabled.
    useEffect(() => {
        if (!filtersHydrated || loading || !hydratedFiltersRef.current || !persistMangaFilters) return;

        const serializedSnapshot = JSON.stringify(persistedFilterSnapshot);
        if (serializedSnapshot === lastPersistedSnapshotRef.current) return;

        if (pendingPersistTimeoutRef.current !== null) {
            window.clearTimeout(pendingPersistTimeoutRef.current);
        }

        pendingPersistTimeoutRef.current = window.setTimeout(() => {
            lastPersistedSnapshotRef.current = serializedSnapshot;
            setParams({ mangaListFilters: persistedFilterSnapshot }, { broadcast: false });
            pendingPersistTimeoutRef.current = null;
        }, 250);

        return () => {
            if (pendingPersistTimeoutRef.current !== null) {
                window.clearTimeout(pendingPersistTimeoutRef.current);
                pendingPersistTimeoutRef.current = null;
            }
        };
    }, [filtersHydrated, persistedFilterSnapshot, loading, persistMangaFilters, setParams]);

    useEffect(() => {
        return () => {
            if (!persistMangaFilters || !hydratedFiltersRef.current) return;
            if (pendingPersistTimeoutRef.current === null) return;

            window.clearTimeout(pendingPersistTimeoutRef.current);
            pendingPersistTimeoutRef.current = null;

            const latestSnapshot = latestPersistedFilterSnapshotRef.current;
            if (!latestSnapshot) return;

            const serializedSnapshot = JSON.stringify(latestSnapshot);
            if (serializedSnapshot === lastPersistedSnapshotRef.current) return;

            const nextSettings = {
                ...(latestParamsRef.current || {}),
                mangaListFilters: latestSnapshot,
            };

            try {
                if (window.api && typeof window.api.saveSettings === 'function') {
                    void window.api.saveSettings(nextSettings);
                }
                lastPersistedSnapshotRef.current = serializedSnapshot;
            } catch (err) {
                console.error('Failed to flush manga filters on unmount', err);
            }
        };
    }, [persistMangaFilters]);

    // Clear any saved filter snapshot when persistence is disabled.
    useEffect(() => {
        if (!filtersHydrated || loading || !hydratedFiltersRef.current || persistMangaFilters || params?.mangaListFilters == null) return;
        setParams({ mangaListFilters: null }, { broadcast: false });
    }, [filtersHydrated, loading, params?.mangaListFilters, persistMangaFilters, setParams]);

    // Options pour l'entity picker statut
    const statusOptions: EntityOption[] = [
        { id: 'Lu', name: 'Lu' },
        { id: 'Non lu', name: 'Non lu' },
        { id: 'En cours', name: 'En cours' }
    ];

    // Options pour l'entity picker langue
    const languageOptions: EntityOption[] = [
        { id: '', name: 'Aucune' },
        ...languages.map(l => ({ id: l.code, name: l.frenchName }))
    ];

    return (
        <div className={`searchAndSort ${expanded ? 'expanded' : 'collapsed'}`}>
            <div className="searchAndSort__header">
                <div className="searchAndSort__intro">
                    <div className="searchAndSort__eyebrow">Bibliotheque</div>
                    <div className="searchAndSort__titleRow">
                        <h2 className="searchAndSort__title">Recherche et filtres</h2>
                        <span className="searchAndSort__badge">{activeAdvancedFilterLabel}</span>
                    </div>
                    <div className="tag-summary">{tagSummary}</div>
                </div>
            </div>

            <div className="search-row">
                <div className="search-input-wrap">
                    <span className="search-input-icon" aria-hidden="true">
                        <MagnifyingGlassIcon focusable="false" />
                    </span>
                    <input
                        className="search-input"
                        placeholder="Rechercher un titre..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') applyFilters(); }}
                    />
                </div>
                <button
                    type="button"
                    className="toggle-filters"
                    onClick={() => setExpanded(v => !v)}
                    title={expanded ? 'Masquer les filtres avances' : 'Afficher les filtres avances'}
                    aria-expanded={expanded}
                    aria-controls="library-filters-panel"
                >
                    <span className="toggle-filters__text">{expanded ? 'Masquer' : 'Filtres avances'}</span>
                    {activeAdvancedFilterCount > 0 ? (
                        <span className="toggle-filters__count" aria-label={activeAdvancedFilterLabel}>{activeAdvancedFilterCount}</span>
                    ) : null}
                    <span className="toggle-filters__icon" aria-hidden="true">
                        <ChevronDownIcon focusable="false" />
                    </span>
                </button>
            </div>

            <div
                className="filters-shell"
                data-expanded={expanded ? 'true' : 'false'}
                id="library-filters-panel"
                aria-hidden={!expanded}
            >
                    <div className="filters">
                    <section className="filter-item filter-card label-above">
                        <div className="filter-card__head">
                            <div className="filter-label">Progression</div>
                            <p className="filter-description">Trie ta bibliotheque selon l'avancement de lecture.</p>
                        </div>
                        <div className="filter-line">
                            <div className="filter-control">
                                <EntityPickerField
                                    field={{ name: 'status', placeholder: 'Filtrer par statut...' } as Field}
                                    options={statusOptions}
                                    value={statusFilter}
                                    onChange={(e: any) => {
                                        const val = Array.isArray(e?.target?.value) ? e.target.value : [];
                                        setStatusFilter(val);
                                    }}
                                    placeholder="Filtrer par statut..."
                                    keepOpenOnAdd={true}
                                />
                            </div>
                        </div>
                    </section>

                    <section className="filter-item filter-card checkbox-group">
                        <div className="filter-card__head">
                            <div className="filter-label">Mise en avant</div>
                            <p className="filter-description">Affinage visuel sans changer l'ordre de tes autres criteres.</p>
                        </div>
                        <div className="checkbox-stack">
                            <label className="preference-toggle">
                                <input type="checkbox" checked={unfinishedFirst} onChange={e => setUnfinishedFirst(e.target.checked)} />
                                <span className="preference-toggle__body">
                                    <span className="preference-toggle__title">Mettre les mangas en cours en tete</span>
                                    <span className="preference-toggle__caption">Pratique pour reprendre rapidement une lecture deja commencee.</span>
                                </span>
                            </label>
                            <label className="preference-toggle">
                                <input type="checkbox" checked={withCompleteOcr} onChange={e => setWithCompleteOcr(e.target.checked)} />
                                <span className="preference-toggle__body">
                                    <span className="preference-toggle__title">Limiter a l'OCR complet</span>
                                    <span className="preference-toggle__caption">N'affiche que les mangas dont l'analyse OCR est terminee.</span>
                                </span>
                            </label>
                        </div>
                    </section>

                    <section className="filter-item filter-card label-above">
                        <div className="filter-card__head">
                            <div className="filter-label">Etiquettes</div>
                            <p className="filter-description">Combine plusieurs etiquettes pour cibler exactement ce que tu cherches.</p>
                        </div>
                        <div className="filter-line">
                            <div className="filter-control">
                                <div className="tag-list">
                                    <EntityPickerField
                                        field={{ name: 'search_tags', placeholder: 'Rechercher des tags...' } as Field}
                                        options={availableTags.map(tag => ({
                                            id: tag.id,
                                            name: tag.name,
                                            hidden: !!tag.hidden,
                                        }))}
                                        value={effectiveSelectedTags}
                                        onChange={(e: any) => {
                                            const val = Array.isArray(e?.target?.value) ? e.target.value : [];
                                            setSelectedTags(val);
                                        }}
                                        placeholder="Rechercher des tags..."
                                        keepOpenOnAdd={true}
                                    />
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="filter-item filter-card label-above">
                        <div className="filter-card__head">
                            <div className="filter-label">Ordre</div>
                            <p className="filter-description">Choisis la facon dont la liste doit etre organisee.</p>
                        </div>
                        <div className="filter-line">
                            <div className="filter-control">
                                <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
                                    <option value="date-desc">Date (récent d'abord)</option>
                                    <option value="date-asc">Date (ancien d'abord)</option>
                                    <option value="title-asc">Titre (A → Z)</option>
                                    <option value="title-desc">Titre (Z → A)</option>
                                </select>
                            </div>
                        </div>
                    </section>

                    <section className="filter-item filter-card label-above">
                        <div className="filter-card__head">
                            <div className="filter-label">Langues</div>
                            <p className="filter-description">Isole les mangas selon leur langue principale ou l'absence de langue.</p>
                        </div>
                        <div className="filter-line">
                            <div className="filter-control">
                                <EntityPickerField
                                    field={{ name: 'language', placeholder: 'Rechercher des langues...' } as Field}
                                    options={languageOptions}
                                    value={selectedLanguageIds}
                                    onChange={(e: any) => {
                                        const val = Array.isArray(e?.target?.value) ? e.target.value : [];
                                        setSelectedLanguageIds(val);
                                    }}
                                    placeholder="Rechercher des langues..."
                                    keepOpenOnAdd={true}
                                />
                            </div>
                        </div>
                    </section>

                    <section className="filter-item filter-card label-above">
                        <div className="filter-card__head">
                            <div className="filter-label">Auteur</div>
                            <p className="filter-description">Filtre la bibliotheque par auteur principal.</p>
                        </div>
                        <div className="filter-line">
                            <div className="filter-control">
                                <AuthorField
                                    field={{ name: 'author', placeholder: 'Rechercher un auteur...' } as Field}
                                    value={selectedAuthorId}
                                    onChange={(e: any) => {
                                        const val = e?.target?.value;
                                        setSelectedAuthorId(val || null);
                                    }}
                                    disableCreate
                                />
                            </div>
                        </div>
                    </section>

                    <section className="filter-item filter-card label-above">
                        <div className="filter-card__head">
                            <div className="filter-label">Serie</div>
                            <p className="filter-description">Focalise la vue sur une collection ou un arc precis.</p>
                        </div>
                        <div className="filter-line">
                            <div className="filter-control">
                                <SeriesField
                                    field={{ name: 'series', placeholder: 'Rechercher des séries...' } as Field}
                                    value={selectedSeriesId}
                                    onChange={(e: any) => {
                                        const val = e?.target?.value;
                                        setSelectedSeriesId(val || null);
                                    }}
                                    disableCreate
                                />
                            </div>
                        </div>
                    </section>
                    </div>
                </div>
        </div>
    );
};

export default SearchAndSort;
