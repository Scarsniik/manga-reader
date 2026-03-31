import React from 'react';
import { ModalOptions } from '@/renderer/context/ModalContext';
import OcrQueueModalContent from './OcrQueueModalContent';

type OcrQueueModalInput = {
  selectedMangaIds?: string[];
  filteredMangaIds?: string[];
};

export default function buildOcrQueueModal(options?: OcrQueueModalInput): ModalOptions {
  return {
    title: 'Avancement OCR',
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
