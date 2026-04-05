import React from 'react';
import { ModalOptions } from '@/renderer/context/ModalContext';
import './ScraperImagePreviewModal.scss';

type Input = {
  imageUrl: string;
  title: string;
};

export default function buildScraperImagePreviewModal({ imageUrl, title }: Input): ModalOptions {
  return {
    className: 'app-modal--image-preview',
    bodyClassName: 'app-modal-body--image-preview',
    content: (
      <div className="scraper-image-preview-modal">
        <img src={imageUrl} alt={title || 'Image du resultat'} />
      </div>
    ),
    actions: [
      { label: 'Fermer', variant: 'secondary' },
    ],
  };
}
