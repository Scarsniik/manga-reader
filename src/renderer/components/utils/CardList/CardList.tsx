import React, { memo, useMemo } from 'react';
import { Manga } from '@/renderer/types';
import MangaCard from '@/renderer/components/MangaCard/MangaCard';
import './styles.scss';

interface CardListProps {
    mangas: Manga[];
    className?: string;
    onRemove?: (id: string) => void;
    onCardUpdated?: (id: string) => void;
    selectedIds?: string[];
    onToggleSelect?: (id: string, additive: boolean) => void;
    selectionMode?: boolean;
    titleLineCount?: number;
    showPageNumbers?: boolean;
}

const CardList: React.FC<CardListProps> = ({
    mangas,
    className = '',
    onRemove,
    onCardUpdated,
    selectedIds,
    onToggleSelect,
    selectionMode,
    titleLineCount = 2,
    showPageNumbers = true,
}) => {
    const selectedIdSet = useMemo(
        () => new Set(selectedIds || []),
        [selectedIds],
    );

    return (
        <div className={`cardList ${className}`.trim()}>
            {mangas.map(m => (
                <div className="cardList-item" key={m.id}>
                    <MangaCard
                        manga={m}
                        onRemove={onRemove}
                        onCardUpdated={onCardUpdated}
                        selected={selectedIdSet.has(m.id)}
                        onToggleSelect={onToggleSelect}
                        selectionMode={selectionMode}
                        titleLineCount={titleLineCount}
                        showPageNumbers={showPageNumbers}
                    />
                </div>
            ))}
        </div>
    );
};

const MemoizedCardList = memo(CardList);
MemoizedCardList.displayName = 'CardList';

export default MemoizedCardList;
