import React from 'react';
import { OcrNavigationDirection } from '../types';

type Args = {
    copyCurrentImage: () => Promise<void>;
    selectedBoxes: string[];
    requestTokenCycle: () => void;
    navigateOcrBox: (direction: OcrNavigationDirection) => boolean;
    next: () => void;
    prev: () => void;
};

const useReaderShortcuts = ({
    copyCurrentImage,
    selectedBoxes,
    requestTokenCycle,
    navigateOcrBox,
    next,
    prev,
}: Args) => {
    React.useEffect(() => {
        const isEditableTarget = (target: EventTarget | null) => {
            if (!(target instanceof HTMLElement)) {
                return false;
            }

            if (target.isContentEditable) {
                return true;
            }

            const tagName = target.tagName.toLowerCase();
            return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
        };

        const onKey = (event: KeyboardEvent) => {
            if (isEditableTarget(event.target)) {
                return;
            }

            const key = event.key.toLowerCase();
            const selectedText = window.getSelection ? window.getSelection()?.toString() : '';
            if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && key === 'c' && !selectedText) {
                try {
                    event.preventDefault();
                } catch {}
                void copyCurrentImage();
                return;
            }

            if (!event.ctrlKey && !event.metaKey && !event.altKey && key === ':' && selectedBoxes.length > 0) {
                try {
                    event.preventDefault();
                } catch {}
                requestTokenCycle();
                return;
            }

            if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
                const ocrDirection = key === 'o'
                    ? 'up'
                    : key === 'k'
                        ? 'left'
                        : key === 'l'
                            ? 'down'
                            : key === 'm'
                                ? 'right'
                                : null;

                if (ocrDirection && navigateOcrBox(ocrDirection)) {
                    try {
                        event.preventDefault();
                    } catch {}
                    return;
                }
            }

            if (key === 'arrowright' || key === 'd' || key === 'p') {
                next();
            } else if (key === 'arrowleft' || key === 'a' || key === 'q' || key === 'i') {
                prev();
            } else if (key === 'z') {
                try {
                    event.preventDefault();
                } catch {}
                const amount = window.innerHeight * 0.6;
                window.scrollBy({ top: -amount, behavior: 'smooth' });
            } else if (key === 's') {
                try {
                    event.preventDefault();
                } catch {}
                const amount = window.innerHeight * 0.6;
                window.scrollBy({ top: amount, behavior: 'smooth' });
            }
        };

        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [copyCurrentImage, navigateOcrBox, next, prev, requestTokenCycle, selectedBoxes]);
};

export default useReaderShortcuts;
