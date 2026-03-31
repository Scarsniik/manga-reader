import React from 'react';
import { ModalOptions } from '@/renderer/context/ModalContext';
import OcrQueueModalContent from './OcrQueueModalContent';

export default function buildOcrQueueModal(): ModalOptions {
  return {
    title: 'Avancement OCR',
    content: <OcrQueueModalContent />,
    actions: [
      { label: 'Fermer', variant: 'secondary' },
    ],
  };
}
