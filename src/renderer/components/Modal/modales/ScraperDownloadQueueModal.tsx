import React from 'react';
import { ModalOptions } from '@/renderer/context/ModalContext';
import ScraperDownloadQueueModalContent from './ScraperDownloadQueueModalContent';

export default function buildScraperDownloadQueueModal(): ModalOptions {
  return {
    title: 'Telechargements',
    content: <ScraperDownloadQueueModalContent />,
    actions: [
      { label: 'Fermer', variant: 'secondary' },
    ],
  };
}
