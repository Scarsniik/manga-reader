import React, { useMemo } from 'react';
import JapaneseAnalyse from '../JapaneseAnalyse/JapaneseAnalyse';
import './ocr-panel.scss';
import { ReaderOcrBox } from './types';

type Box = ReaderOcrBox;

type Props = {
    detectedBoxes: Box[];
    manualBoxes: Box[];
    selectedBoxes: string[];
    tokenCycleRequestNonce?: number;
    tokenCycleSelectionKey?: string | null;
    onSimulate: () => void | Promise<void>;
    onClear: () => void;
    onSelectBox: (id: string | null, additive?: boolean) => void;
    onFocusBox?: (id: string) => void;
    onToggleManualSelection?: () => void;
    onRemoveManualBox?: (id: string) => void | Promise<void>;
    manualSelectionEnabled?: boolean;
    manualSelectionLoading?: boolean;
    detectedSectionOpen?: boolean;
    manualSectionOpen?: boolean;
    onToggleDetectedSection?: () => void;
    onToggleManualSection?: () => void;
    loading?: boolean;
    error?: string | null;
    statusNote?: string | null;
    showBoxes?: boolean;
    onToggleShowBoxes?: (next: boolean) => void;
};

const OcrPanel = React.forwardRef<HTMLElement, Props>(({
    detectedBoxes,
    manualBoxes,
    selectedBoxes,
    tokenCycleRequestNonce = 0,
    tokenCycleSelectionKey = null,
    onSimulate,
    onClear,
    onSelectBox,
    onFocusBox,
    onToggleManualSelection,
    onRemoveManualBox,
    manualSelectionEnabled = false,
    manualSelectionLoading = false,
    detectedSectionOpen = true,
    manualSectionOpen = true,
    onToggleDetectedSection,
    onToggleManualSection,
    loading,
    error,
    statusNote,
    showBoxes = true,
    onToggleShowBoxes,
}, ref) => {
    const allBoxes = [...detectedBoxes, ...manualBoxes];
    const boxMap = new Map(allBoxes.map((box) => [box.id, box] as const));
    const selectedBoxSet = new Set(selectedBoxes);
    const selectedForAnalyse = selectedBoxes
        .map((id) => boxMap.get(id) || null)
        .filter((box): box is Box => !!box);

    const selectionSummary = selectedForAnalyse.length === 0
        ? 'Sélectionne une bulle pour lancer l’analyse.'
        : selectedForAnalyse.length === 1
            ? '1 bulle sélectionnée'
            : `${selectedForAnalyse.length} bulles sélectionnées`;
    const selectionScrollKey = useMemo(() => selectedBoxes.join('|'), [selectedBoxes]);

    const renderBoxButton = (box: Box, typeLabel: string) => (
        <button
            className={selectedBoxSet.has(box.id) ? 'ocr-box-select is-selected' : 'ocr-box-select'}
            onClick={(event) => {
                onSelectBox(box.id, event.ctrlKey || event.metaKey);
                if (typeof onFocusBox === 'function') {
                    onFocusBox(box.id);
                }
            }}
            type="button"
        >
            <span className="ocr-box-select__meta">
                <span className="ocr-box-select__badge">{typeLabel}</span>
                {box.vertical ? <span className="ocr-box-select__tag">Vertical</span> : null}
            </span>
            <span className="ocr-box-select__text">{box.text || '(vide)'}</span>
        </button>
    );

    const hasDetectedBoxes = detectedBoxes.length > 0;
    const hasManualBoxes = manualBoxes.length > 0;
    const hasStatus = !!loading || !!manualSelectionLoading || !!manualSelectionEnabled || !!error || !!statusNote;

    return (
        <aside className="reader-ocr-panel" aria-label="OCR panel" ref={ref}>
            <div className="ocr-panel-inner">
                <div className="ocr-panel-header">
                    <div>
                        <span className="ocr-panel-kicker">Reader OCR</span>
                        <strong>Lecture et vocabulaire</strong>
                        <p className="ocr-panel-subtitle">
                            {selectionSummary}
                        </p>
                    </div>
                    <div className="ocr-panel-controls">
                        <button onClick={() => onSimulate()} disabled={manualSelectionLoading} type="button">Relancer</button>
                        <button onClick={() => onClear()} disabled={manualSelectionLoading} type="button">Vider</button>
                        <button
                            onClick={() => {
                                if (typeof onToggleManualSelection === 'function') {
                                    onToggleManualSelection();
                                }
                            }}
                            disabled={manualSelectionLoading}
                            className={manualSelectionEnabled ? 'is-active' : ''}
                            type="button"
                        >
                            {manualSelectionEnabled ? 'Annuler zone' : 'Zone manuelle'}
                        </button>
                    </div>
                </div>

                <div className="ocr-panel-toolbar">
                    <label className="ocr-checkbox-label">
                        <input
                            type="checkbox"
                            checked={!!showBoxes}
                            onChange={(e) => {
                                if (typeof onToggleShowBoxes === 'function') {
                                    onToggleShowBoxes((e.target as HTMLInputElement).checked);
                                }
                            }}
                        />
                        <span>
                            <strong>Afficher les zones OCR</strong>
                            <small>Superpose les cadres sur l’image</small>
                        </span>
                    </label>
                </div>

                {hasStatus ? (
                    <div className="ocr-status">
                        {loading ? <div className="ocr-status-pill">Chargement OCR…</div> : null}
                        {manualSelectionLoading ? <div className="ocr-status-pill">Analyse de la sélection manuelle…</div> : null}
                        {manualSelectionEnabled ? (
                            <div className="ocr-status-note">Dessine une zone sur l&apos;image pour ajouter une sélection manuelle.</div>
                        ) : null}
                        {error ? <div className="ocr-status-error">{error}</div> : null}
                        {statusNote ? <div className="ocr-status-note">{statusNote}</div> : null}
                    </div>
                ) : null}

                {hasDetectedBoxes || hasManualBoxes ? (
                    <div className="ocr-box-list">
                        {hasDetectedBoxes ? (
                            <div className="ocr-box-section">
                                <div className="ocr-box-section-title">
                                    <button
                                        type="button"
                                        className="ocr-section-toggle"
                                        onClick={() => {
                                            if (typeof onToggleDetectedSection === 'function') {
                                                onToggleDetectedSection();
                                            }
                                        }}
                                        aria-expanded={detectedSectionOpen}
                                    >
                                        <strong>Bulles détectées</strong>
                                        <span>{detectedBoxes.length}</span>
                                    </button>
                                </div>
                                {detectedSectionOpen ? (
                                    <ul>
                                        {detectedBoxes.map((box) => (
                                            <li key={box.id}>{renderBoxButton(box, 'Auto')}</li>
                                        ))}
                                    </ul>
                                ) : null}
                            </div>
                        ) : null}

                        {hasManualBoxes ? (
                            <div className="ocr-box-section">
                                <div className="ocr-box-section-title">
                                    <button
                                        type="button"
                                        className="ocr-section-toggle"
                                        onClick={() => {
                                            if (typeof onToggleManualSection === 'function') {
                                                onToggleManualSection();
                                            }
                                        }}
                                        aria-expanded={manualSectionOpen}
                                    >
                                        <strong>Sélections manuelles</strong>
                                        <span>{manualBoxes.length}</span>
                                    </button>
                                </div>
                                {manualSectionOpen ? (
                                    <ul className="ocr-manual-list">
                                        {manualBoxes.map((box) => (
                                            <li key={box.id} className="ocr-manual-item">
                                                {renderBoxButton(box, 'Manuel')}
                                                <button
                                                    className="ocr-manual-remove"
                                                    onClick={() => {
                                                        if (typeof onRemoveManualBox === 'function') {
                                                            void onRemoveManualBox(box.id);
                                                        }
                                                    }}
                                                    disabled={manualSelectionLoading}
                                                    type="button"
                                                >
                                                    Retirer
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <div className="ocr-boxes-empty">
                        Aucune bulle OCR disponible sur cette page pour le moment.
                    </div>
                )}

                <div className="ocr-analysis">
                    {selectedForAnalyse.length > 0 ? (
                        <JapaneseAnalyse
                            key={selectionScrollKey}
                            selectedBoxes={selectedForAnalyse}
                            analysisScrollKey={selectionScrollKey}
                            tokenCycleRequestNonce={tokenCycleRequestNonce}
                            tokenCycleSelectionKey={tokenCycleSelectionKey}
                            onClose={() => onSelectBox(null)}
                        />
                    ) : (
                        <div className="ocr-analysis-empty">
                            Sélectionne une bulle auto ou manuelle pour afficher la phrase, les furigana et le détail du token.
                        </div>
                    )}
                </div>
            </div>
        </aside>
    );
});

OcrPanel.displayName = 'OcrPanel';

export default OcrPanel;
