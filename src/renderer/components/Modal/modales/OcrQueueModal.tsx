import React from 'react';
import { ModalOptions } from '@/renderer/context/ModalContext';
import OcrQueueModalContent from './OcrQueueModalContent';
import OcrScanIcon from '@/renderer/components/MangaManger/icons/ocr-scan.svg?react';

type OcrQueueModalInput = {
  selectedMangaIds?: string[];
  filteredMangaIds?: string[];
};

export default function buildOcrQueueModal(options?: OcrQueueModalInput): ModalOptions {
  return {
    title: (
      <div className="ocr-queue-modal-title">
        <span className="ocr-queue-modal-title__icon" aria-hidden="true"><OcrScanIcon /></span>
        <span>
          <strong>Centre OCR</strong>
          <small>Lancement et suivi des traitements</small>
        </span>
      </div>
    ),
    className: 'ocr-queue-dialog',
    bodyClassName: 'ocr-queue-dialog__body',
    content: (
      <OcrQueueModalContent
        selectedMangaIds={options?.selectedMangaIds || []}
        filteredMangaIds={options?.filteredMangaIds || []}
      />
    ),
    actions: [
      { label: 'Fermer', variant: 'secondary' },
    ],
  };
}
