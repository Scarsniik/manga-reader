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

const SearchAndSort: React.FC<Props> = ({ mangaList = [], onSearch, defaultSort = 'date-desc', defaultSearch = '' }) => {
    const { tags } = useTags();
    const { params } = useParams();

    // Cache for page counts that are computed asynchronously by backend (like MangaCard)
    const pagesCacheRef = React.useRef<Record<string, number | null | undefined>>({});
    const [pagesVersion, setPagesVersion] = useState<number>(0);

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

    // Initialize from query string if present
    const parseQuery = () => {
        try {
            const qs = new URLSearchParams(window.location.search);
            const q = qs.get('q') ?? defaultSearch;
            const tagsParam = qs.get('tags');
            const tagsArr = tagsParam ? tagsParam.split(',').filter(Boolean) : [];
            const sort = qs.get('sort') ?? defaultSort;
            const exp = qs.get('expanded') === '1';
            // Support multi-language: language=fr,en
            const languageParam = qs.get('language');
            const language = languageParam ? languageParam.split(',').filter(Boolean) : [];
            const status = qs.get('status');
            const unfinished = qs.get('unfinished') === '1';
            return { q, tagsArr, sort, exp, language, status, unfinished };
        } catch (e) {
            return { q: defaultSearch, tagsArr: [], sort: defaultSort, exp: false, language: [], status: null, unfinished: false };
        }
    };

    // Initialisation des filtres depuis l'URL uniquement au premier rendu
    const initial = parseQuery();
    const [query, setQuery] = useState<string>(initial.q);
    const [selectedTags, setSelectedTags] = useState<string[]>(initial.tagsArr);
    const [selectedLanguageIds, setSelectedLanguageIds] = useState<string[]>(initial.language ?? []);
    const [sortBy, setSortBy] = useState<string>(initial.sort);
    const [expanded, setExpanded] = useState<boolean>(initial.exp);
    const [statusFilter, setStatusFilter] = useState<string[]>(initial['status']
        ? Array.isArray(initial['status'])
            ? initial['status']
            : String(initial['status']).split(',').filter(Boolean)
        : []
    );
    const [unfinishedFirst, setUnfinishedFirst] = useState<boolean>(initial['unfinished'] === true);
    const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);

    // Réinitialise les filtres depuis l'URL lors d'un retour ou reload (popstate)
    useEffect(() => {
        const onPopState = () => {
            const initial = parseQuery();
            setQuery(initial.q);
            setSelectedTags(initial.tagsArr);
            setSelectedLanguageIds(initial.language ?? []);
            setSortBy(initial.sort);
            setExpanded(initial.exp);
            setStatusFilter(initial['status']
                ? Array.isArray(initial['status'])
                    ? initial['status']
                    : String(initial['status']).split(',').filter(Boolean)
                : []
            );
            setUnfinishedFirst(initial['unfinished'] === true);
            setSelectedSeriesId(null); // Optionnel: à adapter si la série est dans l'URL
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);

    // Réinitialise les filtres depuis l'URL lors d'un retour ou reload (popstate)
    useEffect(() => {
        const onPopState = () => {
            const initial = parseQuery();
            setQuery(initial.q);
            setSelectedTags(initial.tagsArr);
            setSelectedLanguageIds(initial.language ?? []);
            setSortBy(initial.sort);
            setExpanded(initial.exp);
            setStatusFilter(initial['status']
                ? Array.isArray(initial['status'])
                    ? initial['status']
                    : String(initial['status']).split(',').filter(Boolean)
                : []
            );
            setUnfinishedFirst(initial['unfinished'] === true);
            setSelectedSeriesId(null); // Optionnel: à adapter si la série est dans l'URL
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);

    // applyFilters will be created via useCallback below and triggered automatically

    const toggleTag = (id: string) => {
        setSelectedTags(prev => (prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]));
    };

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

            // status filter: expect m.currentPage and m.pages to derive status
            // statuses: 'Lu' (read) -> currentPage === pages (and pages > 0),
            // 'En cours' -> currentPage > 0 && currentPage < pages,
            // 'Non lu' -> currentPage is null/undefined or currentPage <= 0,
            // 'Tous' -> no filtering
            if (statusFilter && statusFilter.length > 0) {
                // Coerce to numbers and consult async pages cache when pages not present
                const pagesRaw = m.pages;
                const cpRaw = m.currentPage;
                const pagesCount = pagesRaw != null ? Number(pagesRaw) : (pagesCacheRef.current[m.id] ?? undefined);
                const cp = cpRaw != null ? Number(cpRaw) : null;

                // Si plusieurs statuts sélectionnés, on garde si l'un d'eux correspond
                let match = false;
                for (const status of statusFilter) {
                    if (status === 'Lu') {
                        if (pagesCount && cp !== null && cp !== undefined && !Number.isNaN(cp) && cp >= pagesCount) {
                            match = true;
                        }
                    } else if (status === 'En cours') {
                        if (pagesCount && cp !== null && cp !== undefined && !Number.isNaN(cp) && cp > 1 && cp < pagesCount) {
                            match = true;
                        }
                    } else if (status === 'Non lu') {
                        if (!(cp !== null && cp !== undefined && !Number.isNaN(cp) && cp > 0)) {
                            match = true;
                        }
                    }
                }
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
            // Promote mangas that are "En cours" (currentPage > 0 && currentPage < pages) to the top
            result = result.slice().sort((a, b) => {
                // Coerce to numbers (in case pages/currentPage are strings)
                const aPagesRaw = a.pages;
                const bPagesRaw = b.pages;
                const aCpRaw = a.currentPage;
                const bCpRaw = b.currentPage;

                const aPages = aPagesRaw != null ? Number(aPagesRaw) : (pagesCacheRef.current[a.id] ?? undefined);
                const bPages = bPagesRaw != null ? Number(bPagesRaw) : (pagesCacheRef.current[b.id] ?? undefined);
                const aCp = aCpRaw != null ? Number(aCpRaw) : null;
                const bCp = bCpRaw != null ? Number(bCpRaw) : null;

                const aInProgress = (aPages !== undefined && aCp !== null && !Number.isNaN(aCp) && aCp > 1 && aCp < aPages);
                const bInProgress = (bPages !== undefined && bCp !== null && !Number.isNaN(bCp) && bCp > 1 && bCp < bPages);
                if (aInProgress === bInProgress) return 0; // preserve relative order for same status
                return aInProgress ? -1 : 1; // in-progress first
            });
        }

        onSearch(result);
    }, [
        mangaList,
        query,
        selectedTags,
        sortBy,
        tags,
        params,
        statusFilter,
        selectedLanguageIds,
        unfinishedFirst,
        pagesVersion,
        onSearch,
        selectedSeriesId
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
            if (selectedTags && selectedTags.length > 0) qs.set('tags', selectedTags.join(',')); else qs.delete('tags');
            if (sortBy) qs.set('sort', sortBy); else qs.delete('sort');
            if (expanded) qs.set('expanded', '1'); else qs.delete('expanded');
            if (statusFilter && statusFilter.length > 0 && !(statusFilter.length === 1 && statusFilter[0] === 'Tous')) {
                qs.set('status', statusFilter.join(','));
            } else {
                qs.delete('status');
            }
            if (selectedLanguageIds && selectedLanguageIds.length > 0) {
                // Multi-langue: stocker toutes les langues séparées par des virgules
                qs.set('language', selectedLanguageIds.join(','));
            } else {
                qs.delete('language');
            }
            if (unfinishedFirst) qs.set('unfinished', '1'); else qs.delete('unfinished');
            const newQs = qs.toString();
            const newUrl = `${window.location.pathname}${newQs ? '?' + newQs : ''}${window.location.hash || ''}`;
            window.history.replaceState({}, '', newUrl);
        } catch (e) {
            console.warn('Failed to sync search params to URL', e);
        }
    }, [query, selectedTags, sortBy, expanded, statusFilter, unfinishedFirst]);

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

                    {/* Row 2: Language / Series */}
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
                                            setSelectedSeriesId(val);
                                        }}
                                        disableCreate
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* filter actions removed: controls apply automatically */}
                </div>
            )}
        </div>
    );
};

export default SearchAndSort;
