import React from 'react';
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
}

const CardList: React.FC<CardListProps> = ({ mangas, className = '', onRemove, onCardUpdated, selectedIds, onToggleSelect, selectionMode }) => {
    return (
        <div className={`cardList ${className}`.trim()}>
            {mangas.map(m => (
                <div className="cardList-item" key={m.id}>
                    <MangaCard
                        manga={m}
                        onRemove={onRemove}
                        onCardUpdated={onCardUpdated}
                        selected={selectedIds ? selectedIds.includes(m.id) : false}
                        onToggleSelect={onToggleSelect}
                        selectionMode={selectionMode}
                    />
                </div>
            ))}
        </div>
    );
};

export default CardList;
