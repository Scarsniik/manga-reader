import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Manga } from '@/renderer/types';
import useTags from '@/renderer/hooks/useTags';
import TagPickerField from '@/renderer/components/utils/Form/fields/TagPickerField';
import { Field } from '@/renderer/components/utils/Form/types';
import useParams from '@/renderer/hooks/useParams';
import './styles.scss';
import SeriesField from '@/renderer/components/utils/Form/fields/SeriesField';
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
        selectedSeriesId: typeof data.selectedSeriesId === 'string' && data.selectedSeriesId.trim().length > 0
            ? data.selectedSeriesId
            : null,
    };
}

function parseFiltersFromQuery(defaultSort: string, defaultSearch: string) {
    const defaults = buildDefaultFilters(defaultSort, defaultSearch);

    try {
        const qs = new URLSearchParams(window.location.search);
        const hasUrlFilters = ['q', 'tags', 'sort', 'expanded', 'language', 'status', 'unfinished', 'series']
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
                selectedSeriesId: qs.get('series') || null,
            } as MangaListFilterState,
        };
    } catch (e) {
        return { hasUrlFilters: false, filters: defaults };
    }
}

const SearchAndSort: React.FC<Props> = ({ mangaList = [], onSearch, defaultSort = 'date-desc', defaultSearch = '' }) => {
    const { tags } = useTags();
    const { params, loading, setParams } = useParams();
    const persistMangaFilters = params?.persistMangaFilters !== false;

    // Cache for page counts that are computed asynchronously by backend (like MangaCard)
    const pagesCacheRef = React.useRef<Record<string, number | null | undefined>>({});
    const [pagesVersion, setPagesVersion] = useState<number>(0);
    const initialUrlStateRef = React.useRef(parseFiltersFromQuery(defaultSort, defaultSearch));
    const hydratedFiltersRef = React.useRef(false);
    const previousPersistSettingRef = React.useRef(persistMangaFilters);
    const lastPersistedSnapshotRef = React.useRef<string | null>(null);

    const [query, setQuery] = useState<string>(initialUrlStateRef.current.filters.query);
    const [selectedTags, setSelectedTags] = useState<string[]>(initialUrlStateRef.current.filters.selectedTags);
    const [selectedLanguageIds, setSelectedLanguageIds] = useState<string[]>(initialUrlStateRef.current.filters.selectedLanguageIds);
    const [sortBy, setSortBy] = useState<string>(initialUrlStateRef.current.filters.sortBy);
    const [expanded, setExpanded] = useState<boolean>(initialUrlStateRef.current.filters.expanded);
    const [statusFilter, setStatusFilter] = useState<string[]>(initialUrlStateRef.current.filters.statusFilter);
    const [unfinishedFirst, setUnfinishedFirst] = useState<boolean>(initialUrlStateRef.current.filters.unfinishedFirst);
    const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(initialUrlStateRef.current.filters.selectedSeriesId);

    const applyFilterState = useCallback((state: MangaListFilterState) => {
        setQuery(state.query);
        setSelectedTags(state.selectedTags);
        setSelectedLanguageIds(state.selectedLanguageIds);
        setSortBy(state.sortBy);
        setExpanded(state.expanded);
        setStatusFilter(state.statusFilter);
        setUnfinishedFirst(state.unfinishedFirst);
        setSelectedSeriesId(state.selectedSeriesId);
    }, []);

    const currentFilterSnapshot = useMemo<MangaListFilterState>(() => ({
        query,
        selectedTags,
        selectedLanguageIds,
        sortBy,
        expanded,
        statusFilter,
        unfinishedFirst,
        selectedSeriesId,
    }), [
        expanded,
        query,
        selectedLanguageIds,
        selectedSeriesId,
        selectedTags,
        sortBy,
        statusFilter,
        unfinishedFirst,
    ]);

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
        if (loading || hydratedFiltersRef.current) return;

        let startingFilters = initialUrlStateRef.current.filters;

        if (!initialUrlStateRef.current.hasUrlFilters && persistMangaFilters && params?.mangaListFilters) {
            startingFilters = normalizePersistedFilters(params.mangaListFilters, defaultSort, defaultSearch);
            applyFilterState(startingFilters);
        }

        lastPersistedSnapshotRef.current = JSON.stringify(startingFilters);
        hydratedFiltersRef.current = true;
    }, [applyFilterState, defaultSearch, defaultSort, loading, params?.mangaListFilters, persistMangaFilters]);

    useEffect(() => {
        if (persistMangaFilters && !previousPersistSettingRef.current) {
            lastPersistedSnapshotRef.current = null;
        }
        previousPersistSettingRef.current = persistMangaFilters;
    }, [persistMangaFilters]);

    // Restore filters from the URL when browser history changes.
    useEffect(() => {
        const onPopState = () => {
            const next = parseFiltersFromQuery(defaultSort, defaultSearch).filters;
            applyFilterState(next);
        };

        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, [applyFilterState, defaultSearch, defaultSort]);

    const tagSummary = useMemo(() => {
        if (!selectedTags || selectedTags.length === 0) return 'Aucun filtre de tag';
        const names = selectedTags.map(id => tags.find(t => t.id === id)?.name || id);
        return `Tags: ${names.join(', ')}`;
    }, [selectedTags, tags]);

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

            if (selectedTags.length > 0) {
                // require manga to have all selected tags (AND semantics)
                if (!Array.isArray(m.tagIds)) return false;
                const hasAll = selectedTags.every(tid => m.tagIds!.includes(tid));
                if (!hasAll) return false;
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
        pagesVersion,
        params,
        query,
        selectedLanguageIds,
        selectedSeriesId,
        selectedTags,
        sortBy,
        statusFilter,
        tags,
        unfinishedFirst,
    ]);

    // trigger search whenever input state changes
    useEffect(() => {
        applyFilters();
    }, [applyFilters]);

    // Keep query string in sync with filters
    useEffect(() => {
        try {
            const qs = new URLSearchParams(window.location.search);
            if (query) qs.set('q', query); else qs.delete('q');
            if (selectedTags.length > 0) qs.set('tags', encodeArrayParam(selectedTags)); else qs.delete('tags');
            if (sortBy) qs.set('sort', sortBy); else qs.delete('sort');
            if (expanded) qs.set('expanded', '1'); else qs.delete('expanded');
            if (statusFilter.length > 0) qs.set('status', encodeArrayParam(statusFilter)); else qs.delete('status');
            if (selectedLanguageIds.length > 0) {
                qs.set('language', encodeArrayParam(selectedLanguageIds, EMPTY_LANGUAGE_TOKEN));
            } else {
                qs.delete('language');
            }
            if (unfinishedFirst) qs.set('unfinished', '1'); else qs.delete('unfinished');
            if (selectedSeriesId) qs.set('series', selectedSeriesId); else qs.delete('series');
            const newQs = qs.toString();
            const newUrl = `${window.location.pathname}${newQs ? '?' + newQs : ''}${window.location.hash || ''}`;
            window.history.replaceState({}, '', newUrl);
        } catch (e) {
            console.warn('Failed to sync search params to URL', e);
        }
    }, [expanded, query, selectedLanguageIds, selectedSeriesId, selectedTags, sortBy, statusFilter, unfinishedFirst]);

    // Persist filters in settings when the option is enabled.
    useEffect(() => {
        if (loading || !hydratedFiltersRef.current || !persistMangaFilters) return;

        const serializedSnapshot = JSON.stringify(currentFilterSnapshot);
        if (serializedSnapshot === lastPersistedSnapshotRef.current) return;

        const timeoutId = window.setTimeout(() => {
            lastPersistedSnapshotRef.current = serializedSnapshot;
            setParams({ mangaListFilters: currentFilterSnapshot }, { broadcast: false });
        }, 250);

        return () => window.clearTimeout(timeoutId);
    }, [currentFilterSnapshot, loading, persistMangaFilters, setParams]);

    // Clear any saved filter snapshot when persistence is disabled.
    useEffect(() => {
        if (loading || !hydratedFiltersRef.current || persistMangaFilters || params?.mangaListFilters == null) return;
        setParams({ mangaListFilters: null }, { broadcast: false });
    }, [loading, params?.mangaListFilters, persistMangaFilters, setParams]);

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
            <div className="tag-summary">{tagSummary}</div>
            <div className="search-row">
                <input
                    className="search-input"
                    placeholder="Rechercher un titre..."
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') applyFilters(); }}
                />
                <button className="toggle-filters" onClick={() => setExpanded(v => !v)} title="Voir plus de filtre">v</button>
            </div>

            {expanded && (
                <div className="filters">
                    {/* Row 1: Statut + Affichage */}
                    <div className="filter-row">
                        <div className="filter-item label-above">
                            <div className="filter-label">Statut</div>
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
                        </div>

                        <div className="filter-item checkbox-group">
                            <div className="filter-line">
                                <div className="filter-control">
                                    <input type="checkbox" checked={unfinishedFirst} onChange={e => setUnfinishedFirst(e.target.checked)} />
                                    <label className="checkbox-label">Montrer les mangas en cours en premier</label>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Row 2: Tags + Tri */}
                    <div className="filter-row">
                        <div className="filter-item label-above">
                            <div className="filter-label">Tags</div>
                            <div className="filter-line">
                                <div className="filter-control">
                                    <div className="tag-list">
                                        <TagPickerField
                                            field={{ name: 'search_tags', placeholder: 'Rechercher des tags...' } as Field}
                                            value={selectedTags}
                                            onChange={(e: any) => {
                                                const val = Array.isArray(e?.target?.value) ? e.target.value : [];
                                                setSelectedTags(val);
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="filter-item label-above">
                            <div className="filter-label">Tri</div>
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
                        </div>
                    </div>

                    {/* Row 3: Language / Series */}
                    <div className="filter-row">
                        <div className="filter-item label-above">
                            <div className="filter-label">Langue</div>
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
                        </div>
                        <div className="filter-item label-above">
                            <div className="filter-label">Séries</div>
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
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SearchAndSort;
