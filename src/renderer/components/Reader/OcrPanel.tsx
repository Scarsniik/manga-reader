import React, { useMemo } from 'react';
import JapaneseAnalyse from '../JapaneseAnalyse/JapaneseAnalyse';
import './ocr-panel.scss';
import { ReaderOcrBox } from './types';

type Box = ReaderOcrBox;

type Props = {
    detectedBoxes: Box[];
    manualBoxes: Box[];
    selectedBoxes: string[];
    orderSelectionEnabled?: boolean;
    orderedBoxIds?: string[];
    orderedTranslationEnabled?: boolean;
    orderedTranslationRevision?: number;
    tokenCycleRequestNonce?: number;
    tokenCycleSelectionKey?: string | null;
    onSimulate: () => void | Promise<void>;
    onClear: () => void;
    onSelectBox: (id: string | null, additive?: boolean) => void;
    onFocusBox?: (id: string) => void;
    onToggleManualSelection?: () => void;
    onToggleOrderSelection?: () => void;
    onRemoveManualBox?: (id: string) => void | Promise<void>;
    onUpdateBoxText?: (id: string, text: string) => void | Promise<void>;
    manualSelectionEnabled?: boolean;
    manualSelectionLoading?: boolean;
    detectedSectionOpen?: boolean;
    manualSectionOpen?: boolean;
    onToggleDetectedSection?: () => void;
    onToggleManualSection?: () => void;
    loading?: boolean;
    error?: string | null;
    statusNote?: string | null;
    voicePlaybackAvailable?: boolean;
    voicePlaybackStatusLoading?: boolean;
    voicePlaybackLoading?: boolean;
    voicePlaybackPlaying?: boolean;
    voicePlaybackError?: string | null;
    voicePlaybackUnavailableMessage?: string | null;
    onPlaySelectedText?: (textOverride?: string) => void;
    onPlayTokenText?: (text: string) => void;
    voiceAudioDownloadLoading?: boolean;
    voiceAudioDownloadPath?: string | null;
    voiceAudioDownloadError?: string | null;
    onDownloadSelectedAudio?: (textOverride?: string) => void;
    showBoxes?: boolean;
    onToggleShowBoxes?: (next: boolean) => void;
};

const OcrPanel = React.forwardRef<HTMLElement, Props>(({
    detectedBoxes,
    manualBoxes,
    selectedBoxes,
    orderSelectionEnabled = false,
    orderedBoxIds = [],
    orderedTranslationEnabled = false,
    orderedTranslationRevision = 0,
    tokenCycleRequestNonce = 0,
    tokenCycleSelectionKey = null,
    onSimulate,
    onClear,
    onSelectBox,
    onFocusBox,
    onToggleManualSelection,
    onToggleOrderSelection,
    onRemoveManualBox,
    onUpdateBoxText,
    manualSelectionEnabled = false,
    manualSelectionLoading = false,
    detectedSectionOpen = true,
    manualSectionOpen = true,
    onToggleDetectedSection,
    onToggleManualSection,
    loading,
    error,
    statusNote,
    voicePlaybackAvailable = false,
    voicePlaybackStatusLoading = false,
    voicePlaybackLoading = false,
    voicePlaybackPlaying = false,
    voicePlaybackError = null,
    voicePlaybackUnavailableMessage = null,
    onPlaySelectedText,
    onPlayTokenText,
    voiceAudioDownloadLoading = false,
    voiceAudioDownloadPath = null,
    voiceAudioDownloadError = null,
    onDownloadSelectedAudio,
    showBoxes = true,
    onToggleShowBoxes,
}, ref) => {
    const allBoxes = useMemo(() => [...detectedBoxes, ...manualBoxes], [detectedBoxes, manualBoxes]);
    const boxMap = useMemo(() => new Map(allBoxes.map((box) => [box.id, box] as const)), [allBoxes]);
    const selectedBoxSet = useMemo(() => new Set(selectedBoxes), [selectedBoxes]);
    const selectedForAnalyse = useMemo(() => selectedBoxes
        .map((id) => boxMap.get(id) || null)
        .filter((box): box is Box => !!box), [boxMap, selectedBoxes]);
    const translationContextSegments = useMemo(() => {
        const activeSelectedBoxId = selectedBoxes.length === 1 ? selectedBoxes[0] : null;
        const activeOrderIndex = activeSelectedBoxId
            ? orderedBoxIds.indexOf(activeSelectedBoxId)
            : -1;

        if (!orderedTranslationEnabled || activeOrderIndex < 0) {
            return undefined;
        }

        return orderedBoxIds
            .slice(0, activeOrderIndex + 1)
            .map((id) => boxMap.get(id)?.text || '')
            .filter((text) => text.trim().length > 0);
    }, [boxMap, orderedBoxIds, orderedTranslationEnabled, selectedBoxes]);
    const selectedSingleBox = selectedForAnalyse.length === 1 ? selectedForAnalyse[0] : null;
    const selectedVoiceText = selectedSingleBox
        ? String(selectedSingleBox.text || '').trim()
        : '';
    const selectionSummary = orderSelectionEnabled
        ? `Ordre en cours : ${orderedBoxIds.length} zone(s).`
        : selectedForAnalyse.length === 0
        ? 'Sélectionne une bulle pour lancer l’analyse.'
        : selectedForAnalyse.length === 1
            ? '1 bulle sélectionnée'
            : `${selectedForAnalyse.length} bulles sélectionnées`;
    const selectionScrollKey = useMemo(() => selectedBoxes.join('|'), [selectedBoxes]);
    const voicePlaybackButtonTitle = (() => {
        if (voicePlaybackStatusLoading) {
            return 'Vérification de la configuration VOICEVOX...';
        }

        if (!voicePlaybackAvailable) {
            return voicePlaybackUnavailableMessage || "La lecture audio n'est pas disponible pour le moment.";
        }

        if (selectedForAnalyse.length !== 1) {
            return 'Sélectionne une seule bulle OCR à lire.';
        }

        if (!selectedVoiceText) {
            return 'La bulle sélectionnée est vide.';
        }

        return 'Lire la bulle OCR sélectionnée';
    })();
    const canPlaySelectedText = !!onPlaySelectedText
        && !voicePlaybackStatusLoading
        && voicePlaybackAvailable
        && !voicePlaybackLoading
        && selectedForAnalyse.length === 1
        && selectedVoiceText.length > 0;
    const canDownloadSelectedAudio = !!onDownloadSelectedAudio
        && !voicePlaybackStatusLoading
        && voicePlaybackAvailable
        && !voiceAudioDownloadLoading
        && selectedForAnalyse.length === 1
        && selectedVoiceText.length > 0;
    const showVoiceUnavailableNote = selectedForAnalyse.length === 1
        && !voicePlaybackStatusLoading
        && !voicePlaybackAvailable
        && !!voicePlaybackUnavailableMessage;

    const renderBoxButton = (box: Box, typeLabel: string) => (
        <button
            className={[
                'ocr-box-select',
                selectedBoxSet.has(box.id) ? 'is-selected' : '',
                orderSelectionEnabled && orderedBoxIds.includes(box.id) ? 'is-ordered' : '',
            ].filter(Boolean).join(' ')}
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
                {orderSelectionEnabled && orderedBoxIds.includes(box.id) ? (
                    <span className="ocr-box-select__badge">#{orderedBoxIds.indexOf(box.id) + 1}</span>
                ) : null}
                {box.vertical ? <span className="ocr-box-select__tag">Vertical</span> : null}
            </span>
            <span className="ocr-box-select__text">{box.text || '(vide)'}</span>
        </button>
    );

    const hasDetectedBoxes = detectedBoxes.length > 0;
    const hasManualBoxes = manualBoxes.length > 0;
    const hasStatus = !!loading
        || !!manualSelectionLoading
        || !!manualSelectionEnabled
        || !!orderSelectionEnabled
        || !!error
        || !!statusNote
        || !!voicePlaybackError
        || !!voiceAudioDownloadError
        || !!voiceAudioDownloadLoading
        || !!voiceAudioDownloadPath
        || !!voicePlaybackLoading
        || !!voicePlaybackPlaying
        || !!showVoiceUnavailableNote;

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
                                if (typeof onPlaySelectedText === 'function') {
                                    onPlaySelectedText();
                                }
                            }}
                            disabled={!canPlaySelectedText}
                            title={voicePlaybackButtonTitle}
                            type="button"
                        >
                            {voicePlaybackLoading ? 'Préparation...' : voicePlaybackPlaying ? 'Relire' : 'Lire'}
                        </button>
                        <button
                            onClick={() => {
                                if (typeof onDownloadSelectedAudio === 'function') {
                                    onDownloadSelectedAudio();
                                }
                            }}
                            disabled={!canDownloadSelectedAudio}
                            title={selectedForAnalyse.length !== 1
                                ? 'Sélectionne une seule bulle OCR à télécharger.'
                                : !selectedVoiceText
                                    ? 'La bulle sélectionnée est vide.'
                                    : !voicePlaybackAvailable
                                        ? voicePlaybackUnavailableMessage || "L'audio OCR n'est pas disponible pour le moment."
                                    : "Télécharger l'audio OCR de la bulle sélectionnée"}
                            type="button"
                        >
                            {voiceAudioDownloadLoading ? 'Téléchargement...' : 'Télécharger audio'}
                        </button>
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
                        <button
                            onClick={() => {
                                if (typeof onToggleOrderSelection === 'function') {
                                    onToggleOrderSelection();
                                }
                            }}
                            disabled={manualSelectionLoading}
                            className={orderSelectionEnabled ? 'is-active' : ''}
                            type="button"
                        >
                            {orderSelectionEnabled ? 'Valider ordre' : 'Ordre trad'}
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
                        {voicePlaybackLoading ? <div className="ocr-status-pill">Préparation de la voix…</div> : null}
                        {voicePlaybackPlaying ? <div className="ocr-status-pill">Lecture audio en cours.</div> : null}
                        {voiceAudioDownloadLoading ? <div className="ocr-status-pill">Enregistrement audio OCR…</div> : null}
                        {voiceAudioDownloadPath ? <div className="ocr-status-note">Audio OCR enregistré : {voiceAudioDownloadPath}</div> : null}
                        {manualSelectionEnabled ? (
                            <div className="ocr-status-note">Dessine une zone sur l&apos;image pour ajouter une sélection manuelle.</div>
                        ) : null}
                        {orderSelectionEnabled ? (
                            <div className="ocr-status-note">Clique les zones sur la page dans l&apos;ordre de lecture. Clique une zone déjà numérotée pour la retirer.</div>
                        ) : null}
                        {error ? <div className="ocr-status-error">{error}</div> : null}
                        {voicePlaybackError ? <div className="ocr-status-error">{voicePlaybackError}</div> : null}
                        {voiceAudioDownloadError ? <div className="ocr-status-error">{voiceAudioDownloadError}</div> : null}
                        {showVoiceUnavailableNote ? <div className="ocr-status-note">{voicePlaybackUnavailableMessage}</div> : null}
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
                            useTranslationOrder={orderedTranslationEnabled}
                            translationContextSegments={translationContextSegments}
                            translationOrderRevision={orderedTranslationRevision}
                            tokenCycleRequestNonce={tokenCycleRequestNonce}
                            tokenCycleSelectionKey={tokenCycleSelectionKey}
                            voicePlaybackAvailable={voicePlaybackAvailable}
                            voicePlaybackStatusLoading={voicePlaybackStatusLoading}
                            voicePlaybackLoading={voicePlaybackLoading}
                            voicePlaybackPlaying={voicePlaybackPlaying}
                            voicePlaybackUnavailableMessage={voicePlaybackUnavailableMessage}
                            onUpdateSelectedBoxText={
                                selectedSingleBox && typeof onUpdateBoxText === 'function'
                                    ? (text) => onUpdateBoxText(selectedSingleBox.id, text)
                                    : undefined
                            }
                            onPlayTokenText={onPlayTokenText}
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
