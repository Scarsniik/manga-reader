import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Manga } from '@/renderer/types';
import useModal from '@/renderer/hooks/useModal';
import buildEditMangaModal from '@/renderer/components/Modal/modales/EditMangaModal';
import buildMangaOcrModal from '@/renderer/components/Modal/modales/MangaOcrModal';
import useParams from '@/renderer/hooks/useParams';
import Card, { CardOverlayItem } from '@/renderer/components/Card/Card';
import { writeMangaManagerViewState } from '@/renderer/utils/readerNavigation';

interface Props {
    manga: Manga;
    onRemove?: (id: string) => void;
    onCardUpdated?: (id: string) => void;
    selected?: boolean;
    onToggleSelect?: (id: string, additive: boolean) => void;
    selectionMode?: boolean;
}

const MangaCard: React.FC<Props> = ({
    manga,
    onRemove,
    onCardUpdated,
    selected = false,
    onToggleSelect,
    selectionMode = false
}) => {
    const [pages, setPages] = useState<number | null | undefined>(manga.pages);
    const [currentPage, setCurrentPage] = useState<number | null | undefined>(manga.currentPage);
    const [coverPath, setCoverPath] = useState<string | null>(null);
    const [isOverlayVisible, setIsOverlayVisible] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const { openModal } = useModal();
    const { params } = useParams();

    const rememberReaderReturnPoint = useCallback(() => {
        const content = document.querySelector('.mangaManager-content');
        const elementScrollTop = content instanceof HTMLElement ? content.scrollTop : 0;
        const windowScrollTop = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
        const scrollTop = Math.max(elementScrollTop, windowScrollTop);

        writeMangaManagerViewState({
            focusMangaId: manga.id,
            scrollTop,
        });
    }, [manga.id]);

    const resolveTotalPages = useCallback(async (): Promise<number | null> => {
        const knownPages = typeof pages === 'number' && pages > 0
            ? pages
            : (typeof manga.pages === 'number' && manga.pages > 0 ? manga.pages : null);

        if (knownPages !== null) {
            return knownPages;
        }

        if (manga.path && window.api && typeof window.api.countPages === 'function') {
            try {
                const count = await window.api.countPages(manga.path);
                const normalizedCount = typeof count === 'number' && count > 0 ? count : null;
                setPages(normalizedCount);
                return normalizedCount;
            } catch (err) {
                console.warn('Failed to count pages before opening reader', err);
            }
        }

        return null;
    }, [manga.pages, manga.path, pages]);

    const openReader = useCallback(async () => {
        rememberReaderReturnPoint();

        const savedPage = (typeof manga.currentPage === 'number' && manga.currentPage > 0) ? manga.currentPage : 1;
        const totalPages = await resolveTotalPages();
        const shouldRestartFromBeginning = totalPages !== null && savedPage >= totalPages;
        const targetPage = shouldRestartFromBeginning ? 1 : savedPage;

        navigate(
            `/reader?id=${encodeURIComponent(manga.id)}&page=${encodeURIComponent(String(targetPage))}`,
            {
                state: {
                    from: {
                        pathname: location.pathname,
                        search: location.search,
                    },
                    mangaId: manga.id,
                },
            }
        );
    }, [location.pathname, location.search, manga.currentPage, manga.id, navigate, rememberReaderReturnPoint, resolveTotalPages]);

    useEffect(() => {
        const fetchPages = async () => {
            if (manga.path && window.api && window.api.countPages) {
                try {
                    const count = await window.api.countPages(manga.path);
                    setPages(count);
                } catch (err) {
                    console.error('Failed to count pages', err);
                    setPages(null);
                }
            }
        };
        const fetchCover = async () => {
            if (manga.path && window.api) {
                try {
                    if (typeof window.api.getCover === 'function') {
                        const cover = await window.api.getCover(manga.path);
                        setCoverPath(cover);
                    }
                } catch (err) {
                    console.error('Failed to get cover', err);
                    setCoverPath(null);
                }
            }
        };
        fetchPages();
        fetchCover();
    }, [manga.path]);

    // Keep local currentPage in sync with incoming prop
    useEffect(() => {
        setCurrentPage(manga.currentPage);
    }, [manga.currentPage]);

    // Normalize local file path to a proper local:// URL
    const coverSrc = useMemo(() => {
        if (!coverPath) return null;
        let src = coverPath as string;
            if (src) {
                // If already a local:// URL, return as-is
                if (src.startsWith('local://')) {
                    return src;
                }
                if (src.startsWith('file://')) {
                    // convert file:// -> local://
                    src = src.replace(/^file:\/\//, 'local://');
                } else if (src.match(/^[A-Za-z]:\\/)) {
                    // Windows absolute path -> local:///D:/path
                    src = 'local:///' + src.replace(/\\/g, '/');
                } else if (src.startsWith('/')) {
                    src = 'local://' + src;
                } else {
                    src = 'local://' + src.replace(/\\/g, '/');
                }
        }

        return src;
    }, [coverPath]);

    const onCardClick = useCallback((e: React.MouseEvent) => {
        // If ctrlKey or selectionMode, toggle selection instead of navigation
        const ev = e as React.MouseEvent;
        const additive = ev.ctrlKey || ev.metaKey;
        if (additive || selectionMode) {
            if (onToggleSelect) onToggleSelect(manga.id, additive);
            return;
        }
        openReader();
    }, [manga.id, onToggleSelect, openReader, selectionMode]);

    const onEditClick = useCallback(() => {
        try {
            openModal(buildEditMangaModal(manga));
        } catch (err) {
            console.error('Failed to open edit modal', err);
        }
    }, [manga, openModal]);

    const onOcrClick = useCallback(() => {
        try {
            openModal(buildMangaOcrModal(manga));
        } catch (err) {
            console.error('Failed to open OCR modal', err);
        }
    }, [manga, openModal]);

    const onCardKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            openReader();
        }
    }, [openReader]);

    const onToggleRead = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation();
        // Toggle read/unread: if currentPage >= pages -> mark unread (clear), else mark read (set to pages)
        try {
            const pagesCount = pages;
            const current = typeof currentPage === 'number' ? currentPage : null;
            if (!pagesCount || pagesCount === null) {
                // If we don't know pages yet, attempt to fetch via API
                if (window.api && typeof window.api.countPages === 'function' && manga.path) {
                    try {
                        const c = await window.api.countPages(manga.path);
                        setPages(c);
                    } catch (err) {
                        console.warn('Failed to count pages on mark toggle', err);
                    }
                }
            }
            const finalPages = pages || undefined;
            const shouldMarkRead = !(typeof current === 'number' && finalPages && current >= finalPages);
            const newCurrent = shouldMarkRead ? finalPages : null;

            // optimistic UI update
            setCurrentPage(newCurrent ?? null);
            // persist change
            if (window.api && typeof window.api.setMangaCurrentPage === 'function') {
                await window.api.setMangaCurrentPage(manga.id, newCurrent);
            } else if (window.api && typeof window.api.updateManga === 'function') {
                await window.api.updateManga({ ...manga, currentPage: newCurrent });
            } else {
                console.warn('No API to persist currentPage change');
            }

            // Close overlay to reflect change
            setIsOverlayVisible(false);
            // Notify parent that this card was updated so list can reapply filters
            try { if (typeof onCardUpdated === 'function') onCardUpdated(manga.id); } catch (err) { console.warn('onCardUpdated failed', err); }
        } catch (err) {
            console.error('Failed to toggle read/unread', err);
            alert('Échec de la mise à jour du statut');
        }
    }, [manga, pages, currentPage, setCurrentPage, setIsOverlayVisible, onCardUpdated]);

    const onDeleteClick = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation();
        const ok = confirm(`Supprimer "${manga.title}" ?`);
        if (!ok) return;
        try {
            if (onRemove) {
                await onRemove(manga.id);
            } else if (window.api && typeof window.api.removeManga === 'function') {
                const updated = await window.api.removeManga(manga.id);
                console.log('removeManga returned', updated);
            } else {
                console.warn('No remove handler available');
            }
            // notify parent so it can update UI / filters
            try { if (typeof onCardUpdated === 'function') onCardUpdated(manga.id); } catch (err) { console.warn('onCardUpdated failed', err); }
        } catch (err) {
            console.error('Failed to remove manga', err);
            alert('Échec de la suppression');
        }
    }, [manga.id, onRemove, onCardUpdated]);

    const overlayContent: CardOverlayItem[] = useMemo(() => ([
        {
            label: 'Lire',
            onClick: onCardClick
        },
        {
            label: 'Modifier',
            onClick: onEditClick
        },
        {
            label: 'OCR / Vocabulaire',
            onClick: onOcrClick
        },
        {
            label: pages === currentPage ? 'Marquer comme non lu' : 'Marquer comme lu',
            onClick: onToggleRead
        },
        {
            label: 'Supprimer',
            onClick: onDeleteClick
        }
    ]), [onCardClick, onDeleteClick, onEditClick, onOcrClick, onToggleRead, pages, currentPage]);

    return (
        <Card
            key={manga.id}
            coverPath={coverSrc}
            title={manga.title}
            dataMangaId={manga.id}
            current={currentPage}
            countLabel="pages"
            overlayContent={overlayContent}
            total={pages}
            selected={selected}
            onClick={onCardClick}
            onKeyDown={onCardKeyDown}
        />
    );
};

export default MangaCard;
