import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Manga } from '@/renderer/types';
import CardList from '@/renderer/components/utils/CardList/CardList';
import './style.scss';
import { useModal } from '@/renderer/hooks/useModal';
import buildSettingsModal from '@/renderer/components/Modal/modales/SettingsModal';
import buildTagsModal from '@/renderer/components/Modal/modales/TagsModal';
import buildBatchEditModal from '@/renderer/components/Modal/modales/BatchEditModal';
import useTags from '@/renderer/hooks/useTags';
import useParams from '@/renderer/hooks/useParams';
import SearchAndSort from '@/renderer/components/SearchAndSort/SearchAndSort';

declare global {
    interface Window {
        api: any;
    }
}

const MangaManager: React.FC = () => {
    const [mangas, setMangas] = useState<Manga[]>([]);
    const [filtered, setFiltered] = useState<Manga[] | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [selectionMode, setSelectionMode] = useState<boolean>(false);
    const { tags } = useTags();
    const { params } = useParams();
    const { openModal } = useModal();
    const contentRef = useRef<HTMLDivElement | null>(null);

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
        }
    }, []);

    useEffect(() => {
        loadMangas();

        const onUpdated = () => {
            loadMangas();
        };
        window.addEventListener('mangas-updated', onUpdated as EventListener);

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
        };
    }, [loadMangas]);

    // Restore scroll position from query string on mount
    useEffect(() => {
        try {
            const qs = new URLSearchParams(window.location.search);
            const scrollStr = qs.get('scroll');
            if (scrollStr && contentRef.current) {
                const val = parseInt(scrollStr, 10);
                if (!Number.isNaN(val)) contentRef.current.scrollTop = val;
            }
        } catch (e) {
            // ignore
        }
    }, []);

    // Save scroll position to query string (debounced)
    useEffect(() => {
        const el = contentRef.current;
        if (!el) return;

        let raf = 0;
        const onScroll = () => {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                try {
                    const qs = new URLSearchParams(window.location.search);
                    qs.set('scroll', String(el.scrollTop));
                    const newQs = qs.toString();
                    const newUrl = `${window.location.pathname}${newQs ? '?' + newQs : ''}${window.location.hash || ''}`;
                    window.history.replaceState({}, '', newUrl);
                } catch (e) {
                    // ignore
                }
            });
        };

        el.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            el.removeEventListener('scroll', onScroll);
            if (raf) cancelAnimationFrame(raf);
        };
    }, [contentRef.current]);

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
        const source = filtered !== null ? filtered : mangas;
    return source.filter(m => {
            if (!params) return true;
            const { showHiddens } = params;

            // Si contient un tag hidden, ne l'affiche que si showHiddens est true
            if (!showHiddens && Array.isArray(m.tagIds) && m.tagIds.length > 0) {
                return !m.tagIds?.some(tid => tags.find(t => t.id === tid && t.hidden));
            }
            return true;
    });
    }, [mangas, params, tags, filtered]);

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

    return (
        <div className="mangaManager">
            <div className="mangaManager-header">
                <h1>Gestion des mangas</h1>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button onClick={() => openModal(buildTagsModal())}>Tags</button>
                    <button onClick={() => openModal(buildSettingsModal())}>Parametres</button>
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
                </div>
            </div>
            <SearchAndSort mangaList={mangas} onSearch={setFiltered} />
                <div className="mangaManager-content" ref={contentRef}>
                {mangas.length === 0 ? (
                    <div className="empty">Aucun manga. Glissez-déposez un dossier n'importe où pour ajouter.</div>
                ) : (
                    <CardList
                        mangas={displayedMangas}
                        onRemove={handleRemove}
                        onCardUpdated={(id: string) => {
                            // reload mangas and clear filtered so SearchAndSort recomputes
                            // preserve scroll position to avoid jumping
                            const el = contentRef.current;
                            const pos = el ? el.scrollTop : 0;
                            (async () => {
                                await loadMangas();
                                setFiltered(null);
                                // restore scroll position (small timeout to let layout update)
                                requestAnimationFrame(() => {
                                    try {
                                        if (el) el.scrollTop = pos;
                                        const qs = new URLSearchParams(window.location.search);
                                        qs.set('scroll', String(pos));
                                        const newQs = qs.toString();
                                        const newUrl = `${window.location.pathname}${newQs ? '?' + newQs : ''}${window.location.hash || ''}`;
                                        window.history.replaceState({}, '', newUrl);
                                    } catch (e) {
                                        // ignore
                                    }
                                });
                            })();
                        }}
                        selectedIds={selectedIds}
                        onToggleSelect={(id: string, additive: boolean) => {
                            setSelectedIds(prev => {
                                const exists = prev.includes(id);
                                if (additive) {
                                    if (exists) return prev.filter(x => x !== id);
                                    return [...prev, id];
                                }
                                // non-additive click (normal click) should replace selection when in selectionMode
                                if (selectionMode) {
                                    if (exists) return prev.filter(x => x !== id);
                                    return [...prev, id];
                                }
                                return prev;
                            });
                        }}
                        selectionMode={selectionMode}
                    />
                )}
            </div>
        </div>
    );
};

export default MangaManager;
