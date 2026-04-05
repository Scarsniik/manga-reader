import React from 'react';
import { ModalOptions } from '@/renderer/context/ModalContext';
import ScrapersModalContent from './ScrapersModalContent';

type ScraperConfigModalView =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'edit'; scraperId: string };

export default function buildScraperConfigModal(initialView?: ScraperConfigModalView): ModalOptions {
  return {
    title: 'Scrappers',
    content: <ScrapersModalContent initialView={initialView} />,
    actions: [
      { label: 'Fermer', variant: 'secondary' },
    ],
  };
}
