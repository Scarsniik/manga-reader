import React from 'react';
import { ModalOptions } from '@/renderer/context/ModalContext';
import { Manga } from '@/renderer/types';
import MangaOcrModalContent from './MangaOcrModalContent';

export default function buildMangaOcrModal(manga: Manga): ModalOptions {
  return {
    title: `OCR: ${manga.title}`,
    content: <MangaOcrModalContent manga={manga} />,
    actions: [
      { label: 'Fermer', variant: 'secondary' },
    ],
  };
}
