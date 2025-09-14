import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Manga } from '@/renderer/types';
import useTags from '@/renderer/hooks/useTags';
import TagPickerField from '@/renderer/components/utils/Form/fields/TagPickerField';
import { Field } from '@/renderer/components/utils/Form/types';
import useParams from '@/renderer/hooks/useParams';
import './styles.scss';

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
            const status = qs.get('status') ?? 'Tous';
            const unfinished = qs.get('unfinished') === '1';
            return { q, tagsArr, sort, exp, status, unfinished };
        } catch (e) {
            return { q: defaultSearch, tagsArr: [], sort: defaultSort, exp: false, status: 'Tous', unfinished: false };
        }
    };

    const initial = parseQuery();

    const [query, setQuery] = useState<string>(initial.q);
    const [selectedTags, setSelectedTags] = useState<string[]>(initial.tagsArr);
    const [sortBy, setSortBy] = useState<string>(initial.sort);
    const [expanded, setExpanded] = useState<boolean>(initial.exp);
    // new: status filter and unfinished-first option
    const [statusFilter, setStatusFilter] = useState<string>(initial['status'] ?? 'Tous');
    const [unfinishedFirst, setUnfinishedFirst] = useState<boolean>(initial['unfinished'] === true);

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
            if (statusFilter && statusFilter !== 'Tous') {
                // Coerce to numbers and consult async pages cache when pages not present
                const pagesRaw = m.pages;
                const cpRaw = m.currentPage;
                const pagesCount = pagesRaw != null ? Number(pagesRaw) : (pagesCacheRef.current[m.id] ?? undefined);
                const cp = cpRaw != null ? Number(cpRaw) : null;

                if (statusFilter === 'Lu') {
                    if (!pagesCount || cp === null || cp === undefined || Number.isNaN(cp)) return false;
                    if (cp < pagesCount) return false;
                } else if (statusFilter === 'En cours') {
                    if (!pagesCount || cp === null || cp === undefined || Number.isNaN(cp)) return false;
                    if (!(cp > 1 && cp < pagesCount)) return false;
                } else if (statusFilter === 'Non lu') {
                    if (cp !== null && cp !== undefined && !Number.isNaN(cp) && cp > 0) return false;
                }
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
    }, [mangaList, query, selectedTags, sortBy, tags, params, statusFilter, unfinishedFirst, pagesVersion, onSearch]);
    // include pagesVersion so filters re-run when async page counts arrive


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
            if (statusFilter && statusFilter !== 'Tous') qs.set('status', statusFilter); else qs.delete('status');
            if (unfinishedFirst) qs.set('unfinished', '1'); else qs.delete('unfinished');
            const newQs = qs.toString();
            const newUrl = `${window.location.pathname}${newQs ? '?' + newQs : ''}${window.location.hash || ''}`;
            window.history.replaceState({}, '', newUrl);
        } catch (e) {
            console.warn('Failed to sync search params to URL', e);
        }
    }, [query, selectedTags, sortBy, expanded, statusFilter, unfinishedFirst]);

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
                                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                                        <option value="Tous">Tous</option>
                                        <option value="Lu">Lu</option>
                                        <option value="Non lu">Non lu</option>
                                        <option value="En cours">En cours</option>
                                    </select>
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

                    {/* filter actions removed: controls apply automatically */}
                </div>
            )}
        </div>
    );
};

export default SearchAndSort;
