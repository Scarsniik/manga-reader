import React from 'react';

type Box = { id: string; text: string; bbox: { x: number; y: number; w: number; h: number } };

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
                const left = `${b.bbox.x * 100}%`;
                const top = `${b.bbox.y * 100}%`;
                const width = `${b.bbox.w * 100}%`;
                const height = `${b.bbox.h * 100}%`;
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
                        title={b.text}
                    >
                        <span className="overlay-label">{b.id.split('-').pop()}</span>
                    </button>
                );
            })}
        </div>
    );
};

export default ImageViewer;
