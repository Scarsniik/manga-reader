import React from 'react';
import { Link } from 'react-router-dom';
import { Manga } from '@/renderer/types';

type Props = {
    manga: Manga | null;
    imagesLength: number;
    currentIndex: number;
    ocrEnabled: boolean;
    onToggleOcr: () => void;
};

const ReaderHeader: React.FC<Props> = ({ manga, imagesLength, currentIndex, ocrEnabled, onToggleOcr }) => {
    return (
        <div className="reader-header">
            <Link to="/" className="reader-back" aria-label="Retour">←</Link>
            <div className="reader-info">
                {manga ? <strong>{manga.title}</strong> : <span>Lecture</span>}
                <span className="page-counter">
                    {imagesLength > 0 ? `${currentIndex + 1} / ${imagesLength}` : '0 / 0'}
                </span>
            </div>

            <div className="reader-ocr-toggle">
                <button
                    className={"ocr-toggle" + (ocrEnabled ? ' active' : '')}
                    onClick={onToggleOcr}
                    aria-pressed={ocrEnabled}
                    title="Activer/Désactiver OCR (placeholder)"
                >
                    OCR
                </button>
            </div>
        </div>
    );
};

export default ReaderHeader;
