import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './style.scss';
import { Manga } from '@/renderer/types';
import ReaderHeader from './ReaderHeader';
import ImageViewer from './ImageViewer';
import OcrPanel from './OcrPanel';
import { getOcrApi, mockOcrRecognize } from '@/renderer/utils/mockOcr';

type ReaderLocationState = {
    from?: {
        pathname: string;
        search?: string;
    };
    mangaId?: string;
} | null;

// We'll read location once and derive query params from it

const Reader: React.FC = () => {
    const [images, setImages] = useState<string[]>([]);
    const [currentIndex, setCurrentIndex] = useState<number>(0);
    const [manga, setManga] = useState<Manga | null>(null);
    const [ocrEnabled, setOcrEnabled] = useState<boolean>(false);
    const [copyFeedback, setCopyFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [showBoxes, setShowBoxes] = useState<boolean>(true);
    const [detectedBoxes, setDetectedBoxes] = useState<Array<{ id: string; text: string; bbox: { x: number; y: number; w: number; h: number } }>>([]);
    const [selectedBoxes, setSelectedBoxes] = useState<string[]>([]);
    const imgRef = useRef<HTMLImageElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const location = useLocation();
    const navigate = useNavigate();
    const query = new URLSearchParams(location.search);
    const locationState = location.state as ReaderLocationState;

    const handleBack = useCallback(() => {
        const historyIndex = window.history.state && typeof window.history.state.idx === 'number'
            ? window.history.state.idx
            : null;
        if (historyIndex !== null && historyIndex > 0) {
            navigate(-1);
            return;
        }

        const fallbackSearch = new URLSearchParams(locationState?.from?.search ?? '');
        const focusMangaId = manga?.id ?? locationState?.mangaId ?? query.get('id');
        if (focusMangaId && !fallbackSearch.get('focus')) {
            fallbackSearch.set('focus', String(focusMangaId));
        }

        navigate(
            {
                pathname: locationState?.from?.pathname ?? '/',
                search: fallbackSearch.toString() ? `?${fallbackSearch.toString()}` : '',
            },
            { replace: true }
        );
    }, [locationState, manga?.id, navigate, query]);

    useEffect(() => {
        const init = async () => {
            // params: id (manga id) and page (1-based)
            const id = query.get('id');
            const pageParam = query.get('page');
            let startPage = 1;
            if (pageParam) {
                const p = parseInt(pageParam, 10);
                if (!isNaN(p) && p > 0) startPage = p;
            }

            console.debug('Reader:init params', { id, pageParam, startPage });

            // get mangas list from backend and find the one with this id
            if (!window.api || typeof window.api.getMangas !== 'function') {
                console.error('window.api.getMangas is not available');
                return;
            }

            const mangas: Manga[] = await window.api.getMangas();
            console.debug('Reader: fetched mangas', mangas);
            const found = id ? mangas.find(m => String(m.id) === String(id)) || null : null;
            console.debug('Reader: found manga', found);
            setManga(found);

            // If manga found and has a path, list pages
            if (found && found.path) {
                if (!window.api || typeof window.api.listPages !== 'function') {
                    console.error('window.api.listPages is not available');
                    setImages([]);
                    return;
                }
                try {
                    const imgs: string[] = await window.api.listPages(found.path);
                    console.debug('Reader: listPages returned', imgs && imgs.length);
                    setImages(imgs || []);
                    // clamp start page
                    const idx = Math.max(0, Math.min((imgs || []).length - 1, startPage - 1));
                    setCurrentIndex(idx);
                } catch (err) {
                    console.error('Reader: listPages threw', err);
                    setImages([]);
                }
            } else {
                setImages([]);
            }
        };

        init();
        // Run when location.search changes
    }, [location.search]);

    // Navigation helpers
    // Ensure view is scrolled to top immediately before changing page
    const scrollToTopImmediate = () => {
        try {
            // If the image element is rendered, scroll it into view at the top
            if (imgRef.current) {
                imgRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
                return;
            }
            // Otherwise, reset container scroll
            if (containerRef.current) {
                containerRef.current.scrollTop = 0;
                return;
            }
            // Fallback to window scroll
            try { window.scrollTo({ top: 0, left: 0 }); } catch (e) { /* ignore */ }
        } catch (err) {
            // ignore
        }
    };

    const goTo = (index: number) => {
        // scroll to top before changing the page so the new page starts at top
        scrollToTopImmediate();
        setCurrentIndex(prev => {
            const next = Math.max(0, Math.min(images.length - 1, index));
            return next;
        });
    };

    const next = () => goTo(currentIndex + 1);
    const prev = () => goTo(currentIndex - 1);

    const showCopyFeedback = useCallback((type: 'success' | 'error', message: string) => {
        setCopyFeedback({ type, message });
    }, []);

    const copyCurrentImage = useCallback(async () => {
        const currentImage = images[currentIndex];
        if (!currentImage) {
            showCopyFeedback('error', 'Aucune image');
            return;
        }

        if (!window.api || typeof window.api.copyImageToClipboard !== 'function') {
            showCopyFeedback('error', 'Copie indisponible');
            return;
        }

        try {
            const result = await window.api.copyImageToClipboard(currentImage);
            if (!result || result.ok !== true) {
                throw new Error(result && result.error ? result.error : 'Impossible de copier l\'image');
            }
            showCopyFeedback('success', 'Image copiee');
        } catch (err: any) {
            showCopyFeedback('error', err && err.message ? err.message : 'Echec de copie');
        }
    }, [currentIndex, images, showCopyFeedback]);

    // When page changes, ensure the image is scrolled to the top of the container/view
    useEffect(() => {
        try {
            if (imgRef.current) {
                imgRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
            } else if (containerRef.current) {
                containerRef.current.scrollTop = 0;
            }
        } catch (err) {
            // ignore
        }
    }, [currentIndex]);

    // Persist current page into the manga object (optional) and notify backend.
    useEffect(() => {
        // update local manga.currentPage
        if (manga) {
            const page1 = images && images.length > 0 ? currentIndex + 1 : null;
            // only update state if different to avoid re-renders
            if (manga.currentPage !== page1) {
                setManga({ ...manga, currentPage: page1 });
            }
        }

        // debounce backend updates to avoid spamming updates during quick navigation
        let cancelled = false;
        const timer = setTimeout(async () => {
            if (cancelled) return;
            try {
                if (!manga || !manga.id) return;
                if (!window.api || typeof window.api.updateManga !== 'function') return;
                const payload: Partial<any> = { id: manga.id, currentPage: images && images.length > 0 ? currentIndex + 1 : null };
                await window.api.updateManga(payload);
                try { window.dispatchEvent(new CustomEvent('mangas-updated')); } catch (e) { /* noop */ }
            } catch (err) {
                console.warn('Failed to persist currentPage', err);
            }
        }, 500);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentIndex]);

    // Keep the page query param in sync with currentIndex so the URL reflects the visible page.
    useEffect(() => {
        try {
            if (!manga) return;
            const pageNum = images && images.length > 0 ? currentIndex + 1 : 1;
            const url = new URL(window.location.href);
            const params = url.searchParams;
            const currentParam = params.get('page');
            if (currentParam !== String(pageNum)) {
                params.set('page', String(pageNum));
                // Use replaceState so we don't add history entries when flipping pages
                const newUrl = url.pathname + '?' + params.toString();
                try { window.history.replaceState({}, '', newUrl); } catch (err) { /* ignore */ }
            }
        } catch (err) {
            // ignore
        }
    }, [currentIndex, images, manga]);

    useEffect(() => {
        if (!copyFeedback) return;

        const timer = window.setTimeout(() => {
            setCopyFeedback(null);
        }, 2200);

        return () => window.clearTimeout(timer);
    }, [copyFeedback]);

    // Keyboard controls
    useEffect(() => {
        const isEditableTarget = (target: EventTarget | null) => {
            if (!(target instanceof HTMLElement)) return false;
            if (target.isContentEditable) return true;
            const tagName = target.tagName.toLowerCase();
            return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
        };

        const onKey = (e: KeyboardEvent) => {
            if (isEditableTarget(e.target)) {
                return;
            }

            const key = e.key.toLowerCase();
            const selectedText = window.getSelection ? window.getSelection()?.toString() : '';
            if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && key === 'c' && !selectedText) {
                try { e.preventDefault(); } catch {}
                void copyCurrentImage();
                return;
            }
            // Page navigation
            if (key === 'arrowright' || key === 'd') {
                next();
            } else if (key === 'arrowleft' || key === 'a' || key === 'q') {
                prev();
            }
            // Vertical scroll: z -> up, s -> down
            else if (key === 'z') {
                try { e.preventDefault(); } catch {}
                const amount = (window.innerHeight) * 0.6;
                window.scrollBy({ top: -amount, behavior: 'smooth' });
            } else if (key === 's') {
                try { e.preventDefault(); } catch {}
                const amount = (window.innerHeight) * 0.6;
                window.scrollBy({ top: amount, behavior: 'smooth' });
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [copyCurrentImage, currentIndex, images]);

    // Mouse click on image: left -> next, right -> prev
    useEffect(() => {
        const img = imgRef.current;
        if (!img) return;
        const onClick = (e: MouseEvent) => {
            // left click
            if (e instanceof MouseEvent) {
                if (e.button === 0) next();
                else if (e.button === 2) prev();
            }
        };
        img.addEventListener('click', onClick);
        img.addEventListener('contextmenu', (ev) => ev.preventDefault());
        return () => {
            img.removeEventListener('click', onClick);
        };
    }, [images, currentIndex]);

    // Debug helpers when no images
    const [debugList, setDebugList] = useState<string[] | null>(null);
    const [debugError, setDebugError] = useState<string | null>(null);
    const [coverData, setCoverData] = useState<string | null>(null);
    const [ocrLoading, setOcrLoading] = useState<boolean>(false);
    const [ocrError, setOcrError] = useState<string | null>(null);

    const runDebugListPages = async () => {
        setDebugError(null);
        setDebugList(null);
        setCoverData(null);
        try {
            if (!manga || !manga.path) {
                setDebugError('No manga path available');
                return;
            }
            if (!window.api || typeof window.api.listPages !== 'function') {
                setDebugError('window.api.listPages not available');
                return;
            }
            const res: string[] = await window.api.listPages(manga.path);
            setDebugList(res || []);
            // try getCoverData as fallback display
            if (window.api && typeof window.api.getCoverData === 'function') {
                try {
                    const data = await window.api.getCoverData(manga.path);
                    if (data) setCoverData(data as string);
                } catch (err) {
                    console.warn('getCoverData failed', err);
                }
            }
        } catch (err: any) {
            console.error('runDebugListPages', err);
            setDebugError(String(err && err.message ? err.message : err));
        }
    };

    // selected bubble data derived from detectedBoxes
    const selectedBoxData = selectedBoxes.length > 0 ? detectedBoxes.find(b => b.id === selectedBoxes[0]) || null : null;
    const vocabItems = selectedBoxData ? selectedBoxData.text.split(/\s+/).filter(Boolean).slice(0, 3) : [];

    return (
        <div className="reader">
            <ReaderHeader
                manga={manga}
                imagesLength={images.length}
                currentIndex={currentIndex}
                ocrEnabled={ocrEnabled}
                canCopyImage={images.length > 0}
                copyFeedback={copyFeedback}
                onBack={handleBack}
                onCopyImage={() => {
                    void copyCurrentImage();
                }}
                onToggleOcr={() => setOcrEnabled(v => !v)}
            />

            <div className={"reader-body" + (ocrEnabled ? ' ocr-on' : '')} ref={containerRef}>
                <div className="reader-view">
                    {images.length > 0 ? (
                        <ImageViewer
                            src={images[currentIndex]}
                            imgRef={imgRef as any}
                            ocrEnabled={ocrEnabled}
                            showBoxes={showBoxes}
                            detectedBoxes={detectedBoxes}
                            selectedBoxes={selectedBoxes}
                            onSelectBox={(id: string | null, additive?: boolean) => {
                                if (!id) {
                                    setSelectedBoxes([]);
                                    return;
                                }
                                setSelectedBoxes(prev => {
                                    const set = new Set(prev);
                                    if (additive) {
                                        if (set.has(id)) set.delete(id);
                                        else set.add(id);
                                        return Array.from(set);
                                    }
                                    return [id];
                                });
                            }}
                        />
                    ) : (
                        <div className="reader-empty">
                            <p>Aucune image à afficher.</p>
                            <div className="reader-debug">
                                <div><strong>Manga path:</strong> {manga && manga.path ? <code>{manga.path}</code> : <em>n/a</em>}</div>
                                <div><strong>APIs:</strong>
                                    <span> getMangas: {window.api && typeof window.api.getMangas === 'function' ? 'OK' : 'NO'}</span>
                                    <span> listPages: {window.api && typeof window.api.listPages === 'function' ? 'OK' : 'NO'}</span>
                                    <span> getCoverData: {window.api && typeof window.api.getCoverData === 'function' ? 'OK' : 'NO'}</span>
                                </div>
                                <div style={{ marginTop: 8 }}>
                                    <button onClick={runDebugListPages} disabled={!manga || !manga.path}>Tester listPages</button>
                                </div>
                                {debugError && <div className="debug-error">Erreur: {debugError}</div>}
                                {debugList && (
                                    <div className="debug-list">
                                        <div><strong>Pages trouvées ({debugList.length}):</strong></div>
                                        <ul>
                                            {debugList.map((d, i) => (
                                                <li key={i}><code style={{ fontSize: 12 }}>{d}</code></li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {coverData && (
                                    <div className="debug-cover">
                                        <div><strong>Cover data:</strong></div>
                                        <img src={coverData} alt="cover debug" style={{ maxWidth: 200, maxHeight: 200 }} />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                </div>

                {ocrEnabled && (
                    <OcrPanel
                        ocrEnabled={ocrEnabled}
                        detectedBoxes={detectedBoxes}
                        selectedBoxes={selectedBoxes}
                        onSimulate={async () => {
                            setOcrError(null);
                            setOcrLoading(true);
                            try {
                                if (!images || images.length === 0) throw new Error('No image to OCR');
                                const src = images[currentIndex];
                                const api = getOcrApi();
                                const ocrResult = await api(src);

                                let { boxes } = ocrResult || {};
                                if (!Array.isArray(boxes) || boxes.length === 0) {
                                    // fallback to built-in mock to ensure dev sees boxes
                                    const fallback = await mockOcrRecognize(src);
                                    boxes = fallback.boxes || [];
                                }
                                setDetectedBoxes(Array.isArray(boxes) ? boxes : []);
                            } catch (err: any) {
                                setOcrError(String(err && err.message ? err.message : err));
                            } finally {
                                setOcrLoading(false);
                            }
                        }}
                        onClear={() => { setDetectedBoxes([]); setSelectedBoxes([]); setOcrError(null); }}
                        onSelectBox={(id, additive) => {
                            if (!id) { setSelectedBoxes([]); return; }
                            setSelectedBoxes(prev => {
                                const set = new Set(prev);
                                if (additive) {
                                    if (set.has(id)) set.delete(id); else set.add(id);
                                    return Array.from(set);
                                }
                                return [id];
                            });
                        }}
                        selectedBoxData={selectedBoxData}
                        vocabItems={vocabItems}
                        loading={ocrLoading}
                        error={ocrError}
                        showBoxes={showBoxes}
                        onToggleShowBoxes={(next: boolean) => setShowBoxes(next)}
                    />
                )}
            </div>

            <div className="reader-controls">
                <button onClick={prev} disabled={currentIndex === 0}>
                    Précédent
                </button>
                <button onClick={next} disabled={currentIndex >= images.length - 1}>
                    Suivant
                </button>
            </div>
        </div>
    );
};

export default Reader;
