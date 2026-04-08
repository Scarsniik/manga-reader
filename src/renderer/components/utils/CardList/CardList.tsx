import React, { memo, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Manga } from '@/renderer/types';
import MangaCard from '@/renderer/components/MangaCard/MangaCard';
import SeriesCard from '@/renderer/components/SeriesCard/SeriesCard';
import { useParams } from '@/renderer/hooks/useParams';
import './styles.scss';

interface CardListProps {
    mangas: Manga[];
    allMangas?: Manga[];
    className?: string;
    onRemove?: (id: string) => void;
    onCardUpdated?: (id: string) => void;
    selectedIds?: string[];
    onToggleSelect?: (id: string, additive: boolean) => void;
    selectionMode?: boolean;
    titleLineCount?: number;
    showPageNumbers?: boolean;
}

type CardListEntry =
    | {
        type: 'manga';
        key: string;
        manga: Manga;
    }
    | {
        type: 'series';
        key: string;
        seriesId: string;
        memberIds: string[];
    };

const normalizeSeriesId = (seriesId?: string | null): string | null => {
    if (typeof seriesId !== 'string') {
        return null;
    }

    const trimmedSeriesId = seriesId.trim();
    return trimmedSeriesId.length > 0 ? trimmedSeriesId : null;
};

const CardList: React.FC<CardListProps> = ({
    mangas,
    allMangas = mangas,
    className = '',
    onRemove,
    onCardUpdated,
    selectedIds,
    onToggleSelect,
    selectionMode,
    titleLineCount = 2,
    showPageNumbers = true,
}) => {
    const { params, loading: paramsLoading } = useParams();
    const location = useLocation();
    const selectedSeriesId = useMemo(() => {
        const queryString = location.search.startsWith('?')
            ? location.search.slice(1)
            : location.search;
        const searchParams = new URLSearchParams(queryString);
        const seriesId = searchParams.get('series');

        return normalizeSeriesId(seriesId);
    }, [location.search]);
    const stackMangaInSeries = (params?.stackMangaInSeries ?? true) && selectedSeriesId === null;
    const selectedIdSet = useMemo(
        () => new Set(selectedIds || []),
        [selectedIds],
    );

    const seriesMemberIdsById = useMemo(() => {
        const next = new Map<string, string[]>();

        allMangas.forEach((manga) => {
            const seriesId = normalizeSeriesId(manga.seriesId);
            if (!seriesId) {
                return;
            }

            const seriesMemberIds = next.get(seriesId);
            if (seriesMemberIds) {
                seriesMemberIds.push(manga.id);
                return;
            }

            next.set(seriesId, [manga.id]);
        });

        return next;
    }, [allMangas]);

    const cardEntries = useMemo<CardListEntry[]>(() => {
        if (!stackMangaInSeries) {
            return mangas.map((manga) => ({
                type: 'manga',
                key: manga.id,
                manga,
            }));
        }

        const seenSeriesIds = new Set<string>();

        return mangas.reduce<CardListEntry[]>((entries, manga) => {
            const seriesId = normalizeSeriesId(manga.seriesId);

            if (!seriesId) {
                entries.push({
                    type: 'manga',
                    key: manga.id,
                    manga,
                });
                return entries;
            }

            if (seenSeriesIds.has(seriesId)) {
                return entries;
            }

            seenSeriesIds.add(seriesId);
            entries.push({
                type: 'series',
                key: seriesId,
                seriesId,
                memberIds: seriesMemberIdsById.get(seriesId) ?? [manga.id],
            });

            return entries;
        }, []);
    }, [mangas, seriesMemberIdsById, stackMangaInSeries]);

    const toggleSeriesSelection = useCallback((memberIds: string[]) => {
        if (!onToggleSelect || memberIds.length === 0) {
            return;
        }

        const everyMangaSelected = memberIds.every((id) => selectedIdSet.has(id));
        const idsToToggle = everyMangaSelected
            ? memberIds.filter((id) => selectedIdSet.has(id))
            : memberIds.filter((id) => !selectedIdSet.has(id));

        idsToToggle.forEach((id) => {
            onToggleSelect(id, true);
        });
    }, [onToggleSelect, selectedIdSet]);

    return (
        <div className={`cardList ${className}`.trim()}>
            {!paramsLoading && cardEntries.map((entry) => (
                <div className="cardList-item" key={entry.key}>
                    {entry.type === 'manga' ? (
                        <MangaCard
                            manga={entry.manga}
                            onRemove={onRemove}
                            onCardUpdated={onCardUpdated}
                            selected={selectedIdSet.has(entry.manga.id)}
                            onToggleSelect={onToggleSelect}
                            selectionMode={selectionMode}
                            titleLineCount={titleLineCount}
                            showPageNumbers={showPageNumbers}
                        />
                    ) : (
                        <SeriesCard
                            seriesId={entry.seriesId}
                            onRemove={onRemove}
                            onCardUpdated={onCardUpdated}
                            selected={entry.memberIds.length > 0 && entry.memberIds.every((id) => selectedIdSet.has(id))}
                            onToggleSelect={() => toggleSeriesSelection(entry.memberIds)}
                            selectionMode={selectionMode}
                            titleLineCount={titleLineCount}
                            showPageNumbers={showPageNumbers}
                        />
                    )}
                </div>
            ))}
        </div>
    );
};

const MemoizedCardList = memo(CardList);
MemoizedCardList.displayName = 'CardList';

export default MemoizedCardList;
