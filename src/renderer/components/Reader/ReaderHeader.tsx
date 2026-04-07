import React from 'react';
import { Manga } from '@/renderer/types';
import { ScraperBookmarkMetadataField } from '@/shared/scraper';
import ScraperBookmarkButton from '@/renderer/components/ScraperBookmarkButton/ScraperBookmarkButton';
import { ReaderCopyFeedback } from './types';

type Props = {
    manga: Manga | null;
    bookmarkExcludedFields?: ScraperBookmarkMetadataField[];
    pageCounterLabel: string;
    ocrEnabled: boolean;
    ocrAvailable?: boolean;
    canCopyImage: boolean;
    copyFeedback: ReaderCopyFeedback | null;
    onBack: () => void;
    onCopyImage: () => void;
    onToggleOcr: () => void;
};

const ReaderHeader: React.FC<Props> = ({
    manga,
    bookmarkExcludedFields,
    pageCounterLabel,
    ocrEnabled,
    ocrAvailable = true,
    canCopyImage,
    copyFeedback,
    onBack,
    onCopyImage,
    onToggleOcr,
}) => {
    return (
        <div className="reader-header">
            <button type="button" className="reader-back" aria-label="Retour" onClick={onBack}>←</button>
            <div className="reader-info">
                <div className="reader-info__text">
                    {manga ? <strong>{manga.title}</strong> : <span>Lecture</span>}
                    {manga?.chapters ? <span className="reader-info__subtitle">{manga.chapters}</span> : null}
                </div>
                <span className="page-counter">{pageCounterLabel}</span>
            </div>

            <div className="reader-actions">
                {manga?.scraperId && manga?.sourceUrl ? (
                    <ScraperBookmarkButton
                        scraperId={manga.scraperId}
                        sourceUrl={manga.sourceUrl}
                        title={manga.title}
                        cover={manga.thumbnailPath || undefined}
                        excludedFields={bookmarkExcludedFields}
                        className="reader-bookmark-button"
                    />
                ) : null}
                <button
                    type="button"
                    className={"reader-action-button" + (copyFeedback ? ` ${copyFeedback.type}` : '')}
                    onClick={onCopyImage}
                    disabled={!canCopyImage}
                    title="Copier l'image courante dans le presse-papiers (Ctrl/Cmd+C)"
                >
                    {copyFeedback?.message ?? 'Copier (Ctrl/Cmd+C)'}
                </button>
                <button
                    type="button"
                    className={"reader-action-button ocr-toggle" + (ocrEnabled ? ' active' : '')}
                    title={ocrAvailable ? 'Activer/Désactiver OCR' : 'OCR indisponible en lecture en ligne'}
                    onClick={onToggleOcr}
                    aria-pressed={ocrEnabled}
                    disabled={!ocrAvailable}
                >
                    OCR
                </button>
            </div>
        </div>
    );
};

export default ReaderHeader;
