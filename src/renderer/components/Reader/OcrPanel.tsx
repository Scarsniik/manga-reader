import React from 'react';
import JapaneseAnalyse, { Box as JBox } from '../JapaneseAnalyse/JapaneseAnalyse';
import './ocr-panel.scss';

type Box = JBox & {
    manual?: boolean;
};

type Props = {
    ocrEnabled: boolean;
    detectedBoxes: Box[];
    manualBoxes: Box[];
    selectedBoxes: string[];
    onSimulate: () => void | Promise<void>;
    onClear: () => void;
    onSelectBox: (id: string | null, additive?: boolean) => void;
    onToggleManualSelection?: () => void;
    onRemoveManualBox?: (id: string) => void | Promise<void>;
    manualSelectionEnabled?: boolean;
    manualSelectionLoading?: boolean;
    selectedBoxData?: Box | null;
    vocabItems: string[];
    loading?: boolean;
    error?: string | null;
    statusNote?: string | null;
    showBoxes?: boolean;
    onToggleShowBoxes?: (next: boolean) => void;
};

const OcrPanel: React.FC<Props> = ({
    detectedBoxes,
    manualBoxes,
    selectedBoxes,
    onSimulate,
    onClear,
    onSelectBox,
    onToggleManualSelection,
    onRemoveManualBox,
    manualSelectionEnabled = false,
    manualSelectionLoading = false,
    vocabItems,
    loading,
    error,
    statusNote,
    showBoxes = true,
    onToggleShowBoxes,
}) => {
    const selectedBoxSet = new Set(selectedBoxes);
    const selectedForAnalyse = [...detectedBoxes, ...manualBoxes].filter((box) => selectedBoxSet.has(box.id));

    return (
        <aside className="reader-ocr-panel" aria-label="OCR panel">
            <div className="ocr-panel-inner">
                <div className="ocr-panel-header">
                    <strong>OCR</strong>
                    <div className="ocr-panel-controls">
                        <button onClick={() => onSimulate()} disabled={manualSelectionLoading}>Relancer</button>
                        <button onClick={() => onClear()} disabled={manualSelectionLoading}>Clear</button>
                        <button
                            onClick={() => {
                                if (typeof onToggleManualSelection === 'function') {
                                    onToggleManualSelection();
                                }
                            }}
                            disabled={manualSelectionLoading}
                            className={manualSelectionEnabled ? 'is-active' : ''}
                        >
                            {manualSelectionEnabled ? 'Annuler zone' : 'Zone manuelle'}
                        </button>
                    </div>
                </div>

                <div className="ocr-panel-row ocr-checkbox-row">
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
                        Afficher les carrés
                    </label>
                </div>

                <div className="ocr-status">
                    {loading ? <div>Chargement OCR…</div> : null}
                    {manualSelectionLoading ? <div>Analyse de la selection manuelle…</div> : null}
                    {manualSelectionEnabled ? (
                        <div className="ocr-status-note">Dessine une zone sur l&apos;image pour ajouter une selection manuelle.</div>
                    ) : null}
                    {error ? <div className="ocr-status-error">{error}</div> : null}
                    {statusNote ? <div className="ocr-status-note">{statusNote}</div> : null}
                </div>

                <div className="ocr-box-list">
                    <div className="ocr-box-section">
                        <div className="ocr-box-section-title"><strong>Bulles détectées</strong></div>
                        {detectedBoxes.length === 0 ? <div><em>Aucune bulle détectée</em></div> : (
                            <ul>
                                {detectedBoxes.map((box) => (
                                    <li key={box.id}>
                                        <button
                                            className={selectedBoxSet.has(box.id) ? 'ocr-box-select is-selected' : 'ocr-box-select'}
                                            onClick={(event) => onSelectBox(box.id, event.ctrlKey || event.metaKey)}
                                        >
                                            {box.text || '(vide)'}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="ocr-box-section">
                        <div className="ocr-box-section-title"><strong>Sélections manuelles</strong></div>
                        {manualBoxes.length === 0 ? <div><em>Aucune sélection manuelle</em></div> : (
                            <ul className="ocr-manual-list">
                                {manualBoxes.map((box) => (
                                    <li key={box.id} className="ocr-manual-item">
                                        <button
                                            className={selectedBoxSet.has(box.id) ? 'ocr-box-select is-selected' : 'ocr-box-select'}
                                            onClick={(event) => onSelectBox(box.id, event.ctrlKey || event.metaKey)}
                                        >
                                            {box.text || '(vide)'}
                                        </button>
                                        <button
                                            className="ocr-manual-remove"
                                            onClick={() => {
                                                if (typeof onRemoveManualBox === 'function') {
                                                    void onRemoveManualBox(box.id);
                                                }
                                            }}
                                            disabled={manualSelectionLoading}
                                        >
                                            Retirer
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                <div className="ocr-analysis">
                    {selectedForAnalyse.length > 0 ? (
                        <JapaneseAnalyse
                            selectedBoxes={selectedForAnalyse}
                            onClose={() => onSelectBox(null)}
                        />
                    ) : null}
                </div>
            </div>
        </aside>
    );
};

export default OcrPanel;
