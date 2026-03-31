import React from 'react';

type Box = { id: string; text: string; bbox: { x: number; y: number; w: number; h: number } };
const BOX_VISUAL_PADDING_PX = 4;

type Props = {
    src: string;
    currentIndex?: number;
    imgRef: React.RefObject<HTMLImageElement> | React.MutableRefObject<HTMLImageElement | null>;
    ocrEnabled: boolean;
    showBoxes?: boolean;
    detectedBoxes: Box[];
    selectedBoxes: string[];
    onSelectBox: (id: string | null, additive?: boolean) => void;
};

const ImageViewer: React.FC<Props> = ({ src, imgRef, ocrEnabled, showBoxes = true, detectedBoxes, selectedBoxes, onSelectBox }) => {
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
        </div>
    );
};

export default ImageViewer;
