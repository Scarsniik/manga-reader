import React from 'react';
import { ModalOptions } from '@/renderer/context/ModalContext';
import ScraperDownloadQueueModalContent from './ScraperDownloadQueueModalContent';
import { DownloadArrowIcon } from '@/renderer/components/icons';

export default function buildScraperDownloadQueueModal(): ModalOptions {
  return {
    title: (
      <div className="download-queue-modal-title">
        <span className="download-queue-modal-title__icon" aria-hidden="true"><DownloadArrowIcon /></span>
        <span>
          <strong>Telechargements</strong>
          <small>Suivi des mangas et chapitres</small>
        </span>
      </div>
    ),
    className: 'download-queue-dialog',
    bodyClassName: 'download-queue-dialog__body',
    content: <ScraperDownloadQueueModalContent />,
    actions: [
      { label: 'Fermer', variant: 'secondary' },
    ],
  };
}
