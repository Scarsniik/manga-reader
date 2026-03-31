import React, { useMemo, useRef, useState } from 'react';

type Box = { id: string; text: string; bbox: { x: number; y: number; w: number; h: number } };
const BOX_VISUAL_PADDING_PX = 4;
const MIN_SELECTION_SIZE_PX = 12;

type ManualSelection = {
    x: number;
    y: number;
    w: number;
    h: number;
};

type Props = {
    src: string;
    currentIndex?: number;
    imgRef: React.RefObject<HTMLImageElement> | React.MutableRefObject<HTMLImageElement | null>;
    ocrEnabled: boolean;
    showBoxes?: boolean;
    detectedBoxes: Box[];
    selectedBoxes: string[];
    onSelectBox: (id: string | null, additive?: boolean) => void;
    manualSelectionEnabled?: boolean;
    manualSelectionLoading?: boolean;
    onManualSelectionComplete?: (selection: ManualSelection) => void | Promise<void>;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const ImageViewer: React.FC<Props> = ({
    src,
    imgRef,
    ocrEnabled,
    showBoxes = true,
    detectedBoxes,
    selectedBoxes,
    onSelectBox,
    manualSelectionEnabled = false,
    manualSelectionLoading = false,
    onManualSelectionComplete,
}) => {
    const [draftSelection, setDraftSelection] = useState<ManualSelection | null>(null);
    const dragStateRef = useRef<{
        pointerId: number;
        startX: number;
        startY: number;
        imageLeft: number;
        imageTop: number;
        imageWidth: number;
        imageHeight: number;
    } | null>(null);

    const selectionStyle = useMemo(() => {
        if (!draftSelection) {
            return null;
        }

        return {
            left: `${draftSelection.x * 100}%`,
            top: `${draftSelection.y * 100}%`,
            width: `${draftSelection.w * 100}%`,
            height: `${draftSelection.h * 100}%`,
        };
    }, [draftSelection]);

    const clearSelection = () => {
        dragStateRef.current = null;
        setDraftSelection(null);
    };

    const updateDraftSelection = (clientX: number, clientY: number) => {
        const dragState = dragStateRef.current;
        if (!dragState) {
            return null;
        }

        const currentX = clamp(clientX - dragState.imageLeft, 0, dragState.imageWidth);
        const currentY = clamp(clientY - dragState.imageTop, 0, dragState.imageHeight);
        const left = Math.min(dragState.startX, currentX);
        const top = Math.min(dragState.startY, currentY);
        const width = Math.abs(currentX - dragState.startX);
        const height = Math.abs(currentY - dragState.startY);

        const normalizedSelection = {
            x: dragState.imageWidth > 0 ? left / dragState.imageWidth : 0,
            y: dragState.imageHeight > 0 ? top / dragState.imageHeight : 0,
            w: dragState.imageWidth > 0 ? width / dragState.imageWidth : 0,
            h: dragState.imageHeight > 0 ? height / dragState.imageHeight : 0,
        };

        setDraftSelection(normalizedSelection);
        return {
            pixelWidth: width,
            pixelHeight: height,
            normalizedSelection,
        };
    };

    return (
        <div className="image-wrap">
            <img ref={imgRef} src={src} alt="page" className="reader-image" />

            {ocrEnabled && showBoxes && detectedBoxes.map(b => {
                const left = `calc(${b.bbox.x * 100}% - ${BOX_VISUAL_PADDING_PX}px)`;
                const top = `calc(${b.bbox.y * 100}% - ${BOX_VISUAL_PADDING_PX}px)`;
                const width = `calc(${b.bbox.w * 100}% + ${BOX_VISUAL_PADDING_PX * 2}px)`;
                const height = `calc(${b.bbox.h * 100}% + ${BOX_VISUAL_PADDING_PX * 2}px)`;
                const isSelected = selectedBoxes.indexOf(b.id) >= 0;
                return (
                    <button
                        key={b.id}
                        className={"overlay-box" + (isSelected ? ' selected' : '')}
                        style={{ left, top, width, height }}
                        onClick={(e) => onSelectBox(b.id, e.ctrlKey || e.metaKey)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                // treat Enter as toggle selection (additive)
                                onSelectBox(b.id, true);
                            }
                        }}
                        aria-pressed={isSelected}
                        aria-label={b.text ? `Zone OCR: ${b.text}` : 'Zone OCR'}
                        title={b.text}
                    />
                );
            })}

            {ocrEnabled && manualSelectionEnabled ? (
                <div
                    className={"manual-selection-layer" + (manualSelectionLoading ? ' loading' : '')}
                    onPointerDown={(event) => {
                        if (manualSelectionLoading) {
                            return;
                        }

                        const imageElement = imgRef.current;
                        if (!imageElement) {
                            return;
                        }

                        const imageRect = imageElement.getBoundingClientRect();
                        if (!imageRect.width || !imageRect.height) {
                            return;
                        }

                        const startX = clamp(event.clientX - imageRect.left, 0, imageRect.width);
                        const startY = clamp(event.clientY - imageRect.top, 0, imageRect.height);
                        dragStateRef.current = {
                            pointerId: event.pointerId,
                            startX,
                            startY,
                            imageLeft: imageRect.left,
                            imageTop: imageRect.top,
                            imageWidth: imageRect.width,
                            imageHeight: imageRect.height,
                        };
                        setDraftSelection({
                            x: imageRect.width > 0 ? startX / imageRect.width : 0,
                            y: imageRect.height > 0 ? startY / imageRect.height : 0,
                            w: 0,
                            h: 0,
                        });
                        event.currentTarget.setPointerCapture(event.pointerId);
                        event.preventDefault();
                    }}
                    onPointerMove={(event) => {
                        const dragState = dragStateRef.current;
                        if (!dragState || dragState.pointerId !== event.pointerId) {
                            return;
                        }

                        updateDraftSelection(event.clientX, event.clientY);
                        event.preventDefault();
                    }}
                    onPointerUp={(event) => {
                        const dragState = dragStateRef.current;
                        if (!dragState || dragState.pointerId !== event.pointerId) {
                            return;
                        }

                        const selectionResult = updateDraftSelection(event.clientX, event.clientY);
                        clearSelection();
                        event.currentTarget.releasePointerCapture(event.pointerId);
                        event.preventDefault();

                        if (!selectionResult) {
                            return;
                        }

                        if (
                            selectionResult.pixelWidth < MIN_SELECTION_SIZE_PX
                            || selectionResult.pixelHeight < MIN_SELECTION_SIZE_PX
                        ) {
                            return;
                        }

                        if (typeof onManualSelectionComplete === 'function') {
                            void onManualSelectionComplete(selectionResult.normalizedSelection);
                        }
                    }}
                    onPointerCancel={() => {
                        clearSelection();
                    }}
                >
                    {selectionStyle ? (
                        <div className="manual-selection-box" style={selectionStyle} />
                    ) : null}
                </div>
            ) : null}
        </div>
    );
};

export default ImageViewer;
