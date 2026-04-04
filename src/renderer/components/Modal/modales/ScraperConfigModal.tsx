import React from 'react';
import { ModalOptions } from '@/renderer/context/ModalContext';
import ScrapersModalContent from './ScrapersModalContent';

export default function buildScraperConfigModal(): ModalOptions {
  return {
    title: 'Scrappers',
    content: <ScrapersModalContent />,
    actions: [
      { label: 'Fermer', variant: 'secondary' },
    ],
  };
}
