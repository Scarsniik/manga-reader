import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Manga } from '@/renderer/types';
import { ScraperRecord } from '@/shared/scraper';
import CardList from '@/renderer/components/utils/CardList/CardList';
import './style.scss';
import { useModal } from '@/renderer/hooks/useModal';
import buildSettingsModal from '@/renderer/components/Modal/modales/SettingsModal';
import buildTagsModal from '@/renderer/components/Modal/modales/TagsModal';
import buildBatchEditModal from '@/renderer/components/Modal/modales/BatchEditModal';
import buildOcrQueueModal from '@/renderer/components/Modal/modales/OcrQueueModal';
import buildScraperDownloadQueueModal from '@/renderer/components/Modal/modales/ScraperDownloadQueueModal';
import buildScraperConfigModal from '@/renderer/components/Modal/modales/ScraperConfigModal';
import useTags from '@/renderer/hooks/useTags';
import useParams from '@/renderer/hooks/useParams';
import SearchAndSort from '@/renderer/components/SearchAndSort/SearchAndSort';
import ScraperBrowser from '@/renderer/components/ScraperBrowser/ScraperBrowser';
import ScraperBookmarksView from '@/renderer/components/ScraperBookmarks/ScraperBookmarksView';
import { ScraperBrowserReturnState } from '@/renderer/components/ScraperBrowser/types';
import {
    clearScraperRouteState,
    parseScraperRouteState,
    writeScraperRouteState,
} from '@/renderer/utils/scraperBrowserNavigation';
import {
    readMangaManagerViewState,
    writeMangaManagerViewState,
} from '@/renderer/utils/readerNavigation';

declare global {
    interface Window {
        api: any;
    }
}

const MangaManager: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [hasLoadedMangas, setHasLoadedMangas] = useState<boolean>(false);
    const [mangas, setMangas] = useState<Manga[]>([]);
    const [scrapers, setScrapers] = useState<ScraperRecord[]>([]);
    const [hasLoadedScrapers, setHasLoadedScrapers] = useState<boolean>(false);
    const [filtered, setFiltered] = useState<Manga[] | null>(null);
    const [hasResolvedInitialFilters, setHasResolvedInitialFilters] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [selectionMode, setSelectionMode] = useState<boolean>(false);
    const [activeDownloadJobCount, setActiveDownloadJobCount] = useState(0);
    const [scraperBrowserSeed, setScraperBrowserSeed] = useState<ScraperBrowserReturnState | null>(null);
    const { tags } = useTags();
    const { params, loading: paramsLoading, setParams } = useParams();
    const { openModal } = useModal();
    const contentRef = useRef<HTMLDivElement | null>(null);
    const hasRestoredViewRef = useRef(false);
    const hasRestoredHomeSearchRef = useRef(false);
    const consumedScraperReturnKeyRef = useRef<string | null>(null);
    const persistHomeSearchTimeoutRef = useRef<number | null>(null);
    const getCurrentScrollTop = useCallback(() => {
        const elementScrollTop = contentRef.current?.scrollTop ?? 0;
        const windowScrollTop = typeof window !== 'undefined'
            ? (window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0)
            : 0;

        return Math.max(elementScrollTop, windowScrollTop);
    }, []);

    const loadMangas = useCallback(async () => {
        try {
            if (!window.api || typeof window.api.getMangas !== 'function') {
                console.error('window.api.getMangas is not available');
                return;
            }
            const data = await window.api.getMangas();
            setMangas(data || []);
        } catch (err) {
            console.error('Failed to load mangas', err);
        } finally {
            setHasLoadedMangas(true);
        }
    }, []);

    const loadScrapers = useCallback(async () => {
        try {
            if (!window.api || typeof window.api.getScrapers !== 'function') {
                console.error('window.api.getScrapers is not available');
                return;
            }

            const data = await window.api.getScrapers();
            setScrapers(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to load scrapers', err);
        } finally {
            setHasLoadedScrapers(true);
        }
    }, []);

    const loadDownloadQueueSummary = useCallback(async () => {
        if (!window.api || typeof window.api.getScraperDownloadQueueStatus !== 'function') {
            setActiveDownloadJobCount(0);
            return;
        }

        try {
            const queueStatus = await window.api.getScraperDownloadQueueStatus();
            setActiveDownloadJobCount(Number(queueStatus?.counts?.active || 0));
        } catch (err) {
            console.warn('Failed to load scraper download queue status', err);
        }
    }, []);

    const restoreScrollPosition = useCallback((scrollTop: number) => {
        requestAnimationFrame(() => {
            const el = contentRef.current;
            if (el) {
                el.scrollTop = scrollTop;
            }
            window.scrollTo({ top: scrollTop, left: 0, behavior: 'auto' });
            writeMangaManagerViewState({ scrollTop });
        });
    }, []);

    const reloadMangasPreservingScroll = useCallback(async () => {
        const scrollTop = getCurrentScrollTop();
        await loadMangas();
        restoreScrollPosition(scrollTop);
    }, [getCurrentScrollTop, loadMangas, restoreScrollPosition]);

    useEffect(() => {
        loadMangas();
        loadScrapers();

        const onUpdated = () => {
            reloadMangasPreservingScroll();
        };
        const onScrapersUpdated = () => {
            void loadScrapers();
        };
        window.addEventListener('mangas-updated', onUpdated as EventListener);
        window.addEventListener('scrapers-updated', onScrapersUpdated as EventListener);

        const handleDrop = async (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();

            const dt = e.dataTransfer;
            if (!dt) {
                console.warn('handleDrop: no dataTransfer on event');
                return;
            }

            const files = Array.from(dt.files || []);
            if (files.length === 0) {
                console.warn('handleDrop: no files in dataTransfer.files — maybe dropped from a browser context or unsupported source.');
                return;
            }

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (!file) continue;

                // In Electron, File objects from OS drops include a .path property with absolute path
                let fullPath = (file as any).path;
                // Try preload helper to resolve path for File objects (Electron webUtils)
                try {
                    if (!fullPath && window.api && typeof window.api.getPathForFile === 'function') {
                        const p = window.api.getPathForFile(file);
                        if (p) fullPath = p;
                        console.log('handleDrop: getPathForFile returned', p);
                    }
                } catch (err) {
                    console.warn('handleDrop: getPathForFile threw', err);
                }
                if (!fullPath) {
                    console.warn('handleDrop: dropped file has no .path property — attempting to parse URI dataTransfer types. file:', file);
                    try {
                        const dt = (e.dataTransfer as DataTransfer);
                        // Try text/uri-list which may contain file:// URLs
                        if (dt && typeof dt.getData === 'function') {
                            const uriList = dt.getData('text/uri-list') || dt.getData('text/plain');
                            if (uriList) {
                                // uriList may contain multiple lines; pick first file:// or plain path
                                const lines = uriList.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
                                let candidate: string | undefined = undefined;
                                for (const l of lines) {
                                    if (l.startsWith('file://')) { candidate = l; break; }
                                    if (/^[a-zA-Z]:(\\|\/)/.test(l) || l.startsWith('/')) { candidate = l; break; }
                                }
                                if (candidate) {
                                    try {
                                            if (candidate.startsWith('file://')) { 
                                            const url = new URL(candidate);
                                            let p = decodeURIComponent(url.pathname || url.href.replace('file://', ''));
                                            // On Windows, pathname may start with /C:/...
                                            if (p.match(/^\/[A-Za-z]:/)) p = p.slice(1);
                                            fullPath = p;
                                        } else {
                                            fullPath = candidate;
                                        }
                                        console.log('handleDrop: parsed path from dataTransfer:', fullPath);
                                    } catch (err) {
                                        console.warn('handleDrop: failed to parse candidate uri', candidate, err);
                                    }
                                }
                            } else {
                                console.log('handleDrop: no uri-list/plain data available in dataTransfer');
                            }
                        }
                    } catch (err) {
                        console.error('handleDrop: error while parsing dataTransfer URIs', err);
                    }

                    // If still no fullPath, fallback to openDirectory dialog
                    if (!fullPath) {
                        console.log('handleDrop: falling back to native openDirectory dialog');
                        if (window.api && typeof window.api.openDirectory === 'function') {
                            try {
                                const picked = await window.api.openDirectory();
                                console.log('handleDrop: openDirectory returned', picked);
                                if (picked) fullPath = picked;
                            } catch (err) {
                                console.error('handleDrop: openDirectory threw', err);
                            }
                        }
                    }

                    if (!fullPath) {
                        console.warn('handleDrop: could not obtain a full path for dropped file, skipping.');
                        alert('Impossible d\'obtenir le chemin complet du dossier depuis le glisser-déposer. Utilisez le bouton "Ajouter" pour sélectionner le dossier manuellement.');
                        continue;
                    }
                }

                const manga = {
                    id: `${Date.now()}-${i}`,
                    title: file.name,
                    path: fullPath,
                    createdAt: new Date().toISOString(),
                };

                try {
                    if (!window.api || typeof window.api.addManga !== 'function') {
                        console.error('window.api.addManga is not available');
                        return;
                    }
                    const updated = await window.api.addManga(manga);
                    setMangas(updated || []);
                } catch (err) {
                    console.error('Failed to add manga', err);
                }
            }
        };

        const handleDragOver = (e: DragEvent) => e.preventDefault();

        window.addEventListener('drop', handleDrop);
        window.addEventListener('dragover', handleDragOver);

        return () => {
            window.removeEventListener('drop', handleDrop);
            window.removeEventListener('dragover', handleDragOver);
            window.removeEventListener('mangas-updated', onUpdated as EventListener);
            window.removeEventListener('scrapers-updated', onScrapersUpdated as EventListener);
        };
    }, [loadMangas, loadScrapers, reloadMangasPreservingScroll]);

    useEffect(() => {
        const el = contentRef.current;
        let raf = 0;
        const onScroll = () => {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                writeMangaManagerViewState({ scrollTop: getCurrentScrollTop() });
            });
        };

        el?.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            el?.removeEventListener('scroll', onScroll);
            window.removeEventListener('scroll', onScroll);
            if (raf) cancelAnimationFrame(raf);
        };
    }, [getCurrentScrollTop]);

    useEffect(() => {
        void loadDownloadQueueSummary();
        const timer = window.setInterval(() => {
            void loadDownloadQueueSummary();
        }, 1200);

        return () => window.clearInterval(timer);
    }, [loadDownloadQueueSummary]);

    const onAddClick = async () => {
        // Use native folder picker to ensure we get an absolute path
        let pickedPath: string | null = null;
        if (window.api && typeof window.api.openDirectory === 'function') {
            pickedPath = await window.api.openDirectory();
        }
        const title = prompt('Titre du manga');
        if (!title || !pickedPath) return;
        const manga = { id: `${Date.now()}`, title, path: pickedPath, createdAt: new Date().toISOString() };
        try {
            if (!window.api || typeof window.api.addManga !== 'function') {
                console.error('window.api.addManga is not available');
                return;
            }
            const updated = await window.api.addManga(manga);
            setMangas(updated || []);
        } catch (err) {
            console.error('Failed to add manga', err);
        }
    };

    const displayedMangas = useMemo(() => {
        if (!hasResolvedInitialFilters) return [];

        const hiddenTagIds = new Set(
            tags.filter(tag => tag.hidden).map(tag => tag.id),
        );
        const source = filtered !== null ? filtered : mangas;
        return source.filter(m => {
            if (!params) return true;
            const { showHiddens } = params;

            // Si contient un tag hidden, ne l'affiche que si showHiddens est true
            if (!showHiddens && Array.isArray(m.tagIds) && m.tagIds.length > 0) {
                return !m.tagIds.some(tid => hiddenTagIds.has(tid));
            }
            return true;
        });
    }, [filtered, hasResolvedInitialFilters, mangas, params, tags]);

    const sortedScrapers = useMemo(
        () => [...scrapers].sort((a, b) => a.name.localeCompare(b.name)),
        [scrapers],
    );

    const routeScraperState = useMemo(
        () => parseScraperRouteState(location.search),
        [location.search],
    );
    const activeViewId = routeScraperState.scraperId ?? 'library';
    const activeScraper = useMemo(
        () => sortedScrapers.find((scraper) => scraper.id === activeViewId) ?? null,
        [activeViewId, sortedScrapers],
    );

    const isLibraryView = activeViewId === 'library';
    const isBookmarksView = activeViewId === 'bookmarks';
    const downloadQueueButtonLabel = activeDownloadJobCount > 0
        ? `Telechargements (${activeDownloadJobCount})`
        : 'Telechargements';

    useEffect(() => {
        if (paramsLoading) {
            return;
        }

        if (hasRestoredHomeSearchRef.current) {
            return;
        }

        hasRestoredHomeSearchRef.current = true;

        if (location.pathname !== '/') {
            return;
        }

        if (location.search) {
            return;
        }

        const lastHomeSearch = typeof params?.lastHomeSearch === 'string'
            ? params.lastHomeSearch.trim()
            : '';

        if (!lastHomeSearch) {
            return;
        }

        navigate(
            {
                pathname: location.pathname,
                search: lastHomeSearch,
            },
            { replace: true }
        );
    }, [location.pathname, location.search, navigate, params?.lastHomeSearch, paramsLoading]);

    useEffect(() => {
        if (paramsLoading || location.pathname !== '/') {
            return;
        }

        const nextSearch = location.search || '';
        if ((params?.lastHomeSearch ?? '') === nextSearch) {
            return;
        }

        if (persistHomeSearchTimeoutRef.current !== null) {
            window.clearTimeout(persistHomeSearchTimeoutRef.current);
        }

        persistHomeSearchTimeoutRef.current = window.setTimeout(() => {
            setParams({ lastHomeSearch: nextSearch }, { broadcast: false });
            persistHomeSearchTimeoutRef.current = null;
        }, 250);

        return () => {
            if (persistHomeSearchTimeoutRef.current !== null) {
                window.clearTimeout(persistHomeSearchTimeoutRef.current);
                persistHomeSearchTimeoutRef.current = null;
            }
        };
    }, [location.pathname, location.search, params?.lastHomeSearch, paramsLoading, setParams]);

    useEffect(() => {
        const nextState = location.state as {
            scraperBrowserReturn?: ScraperBrowserReturnState;
        } | null;

        const scraperBrowserReturn = nextState?.scraperBrowserReturn;
        if (!scraperBrowserReturn) {
            return;
        }

        if (consumedScraperReturnKeyRef.current === location.key) {
            return;
        }

        consumedScraperReturnKeyRef.current = location.key;
        setScraperBrowserSeed(scraperBrowserReturn);
    }, [location.key, location.state]);

    useEffect(() => {
        if (activeViewId === 'library' || activeViewId === 'bookmarks') {
            return;
        }

        if (!hasLoadedScrapers) {
            return;
        }

        if (!scrapers.some((scraper) => scraper.id === activeViewId)) {
            navigate(
                {
                    pathname: location.pathname,
                    search: clearScraperRouteState(location.search),
                },
                { replace: true }
            );
        }
    }, [activeViewId, hasLoadedScrapers, location.pathname, location.search, navigate, scrapers]);

    const handleSearchResults = useCallback((result: Manga[]) => {
        setFiltered(result);
        setHasResolvedInitialFilters(true);
    }, []);

    const handleCardUpdated = useCallback((_id: string) => {
        const pos = getCurrentScrollTop();
        void (async () => {
            await loadMangas();
            restoreScrollPosition(pos);
        })();
    }, [getCurrentScrollTop, loadMangas, restoreScrollPosition]);

    const handleToggleSelect = useCallback((id: string, additive: boolean) => {
        setSelectedIds(prev => {
            const exists = prev.includes(id);
            if (additive) {
                if (exists) return prev.filter(x => x !== id);
                return [...prev, id];
            }
            if (selectionMode) {
                if (exists) return prev.filter(x => x !== id);
                return [...prev, id];
            }
            return prev;
        });
    }, [selectionMode]);

    const handleRemove = async (id: string) => {
        try {
            if (window.api && typeof window.api.removeManga === 'function') {
                const updated = await window.api.removeManga(id);
                setMangas(updated || []);
            } else {
                // Fallback: filter locally
                setMangas(prev => prev.filter(m => m.id !== id));
            }
        } catch (err) {
            console.error('Failed to remove manga', err);
            alert('Impossible de supprimer le manga');
        }
    };

    const handleActiveViewChange = useCallback((nextViewId: string) => {
        if (nextViewId !== activeViewId) {
            setScraperBrowserSeed(null);
        }

        const nextSearch = nextViewId === 'library'
            ? clearScraperRouteState(location.search)
            : writeScraperRouteState(location.search, {
                scraperId: nextViewId,
                mode: 'search',
                searchActive: false,
                searchQuery: '',
                searchPage: 1,
                authorActive: false,
                authorQuery: '',
                authorPage: 1,
                mangaQuery: '',
                bookmarksFilterScraperId: nextViewId === 'bookmarks' ? null : undefined,
            });

        navigate(
            {
                pathname: location.pathname,
                search: nextSearch,
            },
            nextViewId === 'bookmarks'
                ? {
                    replace: true,
                    state: {
                        bookmarksReturn: {
                            pathname: location.pathname,
                            search: location.search,
                        },
                    },
                }
                : { replace: true }
        );
    }, [activeViewId, location.pathname, location.search, navigate]);

    useEffect(() => {
        if (!hasLoadedMangas) return;
        if (hasRestoredViewRef.current) return;

        const el = contentRef.current;
        if (!el) return;

        const savedViewState = readMangaManagerViewState();
        const focusParam = new URLSearchParams(location.search).get('focus');
        const focusMangaId = focusParam || savedViewState?.focusMangaId;
        const savedScrollTop = typeof savedViewState?.scrollTop === 'number'
            ? savedViewState.scrollTop
            : null;
        const hasSavedScroll = savedScrollTop !== null;
        const shouldUseFocusFallback = Boolean(focusMangaId) && (!hasSavedScroll || savedScrollTop <= 0);

        if (!hasSavedScroll && !focusMangaId) {
            hasRestoredViewRef.current = true;
            return;
        }

        hasRestoredViewRef.current = true;

        requestAnimationFrame(() => {
            if (hasSavedScroll) {
                restoreScrollPosition(savedScrollTop ?? 0);
            }

            if (shouldUseFocusFallback) {
                const card = Array.from(el.querySelectorAll<HTMLElement>('[data-manga-id]'))
                    .find(node => node.dataset.mangaId === focusMangaId);

                if (card) {
                    card.scrollIntoView({ block: 'center', behavior: 'auto' });
                    card.focus();
                }
            }

            if (focusMangaId) {
                writeMangaManagerViewState({ focusMangaId: null });
            }

            if (focusParam) {
                const nextSearch = new URLSearchParams(location.search);
                nextSearch.delete('focus');
                navigate(
                    {
                        pathname: location.pathname,
                        search: nextSearch.toString() ? `?${nextSearch.toString()}` : '',
                    },
                    { replace: true }
                );
            }
        });
    }, [displayedMangas.length, hasLoadedMangas, location.pathname, location.search, navigate]);

    return (
        <div className="mangaManager">
            <div className="mangaManager-header">
                <div className="mangaManager-header__view">
                    <select
                        value={activeViewId}
                        onChange={(event) => handleActiveViewChange(event.target.value)}
                        aria-label="Choisir la vue active"
                    >
                        <option value="library">Bibliotheque</option>
                        <option value="bookmarks">Tous les bookmarks</option>
                        {sortedScrapers.map((scraper) => (
                            <option key={scraper.id} value={scraper.id}>
                                {scraper.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="mangaManager-header__actions">
                    {isLibraryView ? (
                        <>
                            <button onClick={() => openModal(buildTagsModal())}>Tags</button>
                            <button
                                onClick={() => openModal(buildOcrQueueModal({
                                    selectedMangaIds: selectedIds,
                                    filteredMangaIds: displayedMangas.map((m) => m.id),
                                }))}
                            >
                                Avancement OCR
                            </button>
                        </>
                    ) : null}
                    <button onClick={() => openModal(buildScraperDownloadQueueModal())}>
                        {downloadQueueButtonLabel}
                    </button>
                    <button onClick={() => openModal(buildSettingsModal())}>Parametres</button>
                    <button onClick={() => openModal(buildScraperConfigModal())}>Scrappers</button>
                    {isLibraryView ? (
                        <>
                            <button onClick={onAddClick}>Ajouter</button>
                            <button
                                onClick={() => setSelectionMode(s => !s)}
                                title="Mode sélection"
                                aria-pressed={selectionMode}
                            >
                                {selectionMode ? 'Quitter sélection' : 'Sélection'}
                            </button>
                            {selectedIds.length > 0 ? (
                                <button onClick={() => openModal(buildBatchEditModal(selectedIds, () => { loadMangas(); setSelectedIds([]); }))}>Modification multiple ({selectedIds.length})</button>
                            ) : null}
                        </>
                    ) : null}
                </div>
            </div>

            {isLibraryView ? (
                <>
                    <SearchAndSort mangaList={mangas} onSearch={handleSearchResults} />
                    <div className="mangaManager-content" ref={contentRef}>
                        {!hasLoadedMangas ? (
                            <div className="empty">Chargement de la bibliothèque...</div>
                        ) : !hasResolvedInitialFilters ? (
                            <div className="empty">Application des filtres enregistrés...</div>
                        ) : mangas.length === 0 ? (
                            <div className="empty">Aucun manga. Glissez-déposez un dossier n'importe où pour ajouter.</div>
                        ) : (
                            <CardList
                                mangas={displayedMangas}
                                allMangas={mangas}
                                scrapers={sortedScrapers}
                                onRemove={handleRemove}
                                onCardUpdated={handleCardUpdated}
                                selectedIds={selectedIds}
                                onToggleSelect={handleToggleSelect}
                                selectionMode={selectionMode}
                                titleLineCount={params?.titleLineCount ?? 2}
                                showPageNumbers={params?.showPageNumbers ?? true}
                            />
                        )}
                    </div>
                </>
            ) : (
                <div className="mangaManager-content mangaManager-content--scraper">
                    {!hasLoadedScrapers ? (
                        <div className="empty">{isBookmarksView ? 'Chargement des bookmarks...' : 'Chargement du scrapper...'}</div>
                    ) : isBookmarksView ? (
                        <ScraperBookmarksView
                            scrapers={sortedScrapers}
                            filterScraperId={routeScraperState.bookmarksFilterScraperId ?? null}
                        />
                    ) : activeScraper ? (
                        <ScraperBrowser
                            scraper={activeScraper}
                            initialState={scraperBrowserSeed && scraperBrowserSeed.scraperId === activeScraper.id
                                ? scraperBrowserSeed
                                : null}
                        />
                    ) : (
                        <div className="empty">Le scrapper selectionne est introuvable.</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default MangaManager;
