import React, { useEffect, useState } from 'react';
import JapaneseAnalyse, { Box as JBox } from '../JapaneseAnalyse/JapaneseAnalyse';
import './ocr-panel.scss';

type Box = JBox;

type Props = {
    ocrEnabled: boolean;
    detectedBoxes: Box[];
    selectedBoxes: string[];
    onSimulate: () => void | Promise<void>;
    onClear: () => void;
    onSelectBox: (id: string | null, additive?: boolean) => void;
    selectedBoxData?: Box | null;
    vocabItems: string[];
    loading?: boolean;
    error?: string | null;
    showBoxes?: boolean;
    onToggleShowBoxes?: (next: boolean) => void;
};

const OcrPanel: React.FC<Props> = ({ ocrEnabled, detectedBoxes, selectedBoxes, onSimulate, onClear, onSelectBox, selectedBoxData, vocabItems, loading, error, showBoxes = true, onToggleShowBoxes }) => {
    const [localLoading, setLocalLoading] = useState<boolean>(false);
    const [localError, setLocalError] = useState<string | null>(null);
    const [boxes, setBoxes] = useState<Box[]>(detectedBoxes || []);

    // sync incoming detectedBoxes
    useEffect(() => setBoxes(detectedBoxes || []), [detectedBoxes]);

    useEffect(() => {
        // when panel opens, ask parent to run detection if no boxes
        if (ocrEnabled && (!boxes || boxes.length === 0)) {
            // call parent's onSimulate to populate Reader.detectedBoxes
            try {
                if (typeof onSimulate === 'function') onSimulate();
            } catch (err) {
                // ignore errors; Reader will surface them via props
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ocrEnabled]);

    return (
        <aside className="reader-ocr-panel" aria-label="OCR panel">
            <div className="ocr-panel-inner">
                <div className="ocr-panel-header">
                    <strong>OCR (mock)</strong>
                    <div className="ocr-panel-controls">
                        <button onClick={() => onSimulate()}>Relancer</button>
                        <button onClick={() => { setBoxes([]); onClear(); }}>Clear</button>
                    </div>
                </div>

                <div className="ocr-panel-row ocr-checkbox-row">
                    <label className="ocr-checkbox-label">
                        <input
                            type="checkbox"
                            checked={!!showBoxes}
                            onChange={(e) => {
                                if (typeof onToggleShowBoxes === 'function') onToggleShowBoxes((e.target as HTMLInputElement).checked);
                            }}
                        />
                        Afficher les carrés
                    </label>
                </div>

                <div className="ocr-status">
                    {loading || localLoading ? <div>Chargement OCR…</div> : null}
                    {error || localError ? <div style={{ color: 'crimson' }}>{error || localError}</div> : null}
                </div>

                <div className="ocr-box-list">
                    {boxes.length === 0 ? <div><em>Aucune bulle détectée</em></div> : (
                        <div>
                            <div style={{ marginBottom: 8 }}><strong>Bulles détectées</strong></div>
                            <ul>
                                {boxes.map(b => (
                                    <li key={b.id}>
                                        <button className="" onClick={(e) => onSelectBox(b.id, (e as any).ctrlKey || (e as any).metaKey)}>{b.text || '(vide)'}</button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                <div style={{ marginTop: 12 }}>
                    {selectedBoxes && selectedBoxes.length > 0 ? (
                        <JapaneseAnalyse selectedBoxes={boxes.filter(b => selectedBoxes.indexOf(b.id) >= 0)} onClose={() => onSelectBox(null)} />
                    ) : null}
                </div>
            </div>
        </aside>
    );
};

export default OcrPanel;
