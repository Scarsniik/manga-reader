import React from 'react';
import { ModalOptions } from '@/renderer/context/ModalContext';
import BatchEditModalContent from './BatchEditModalContent';

export default function buildBatchEditModal(selectedIds: string[], onDone?: () => void): ModalOptions {
  const submitButtonId = `batch-edit-submit-${selectedIds.length}`;
  return {
    title: 'Modification multiple',
    content: <BatchEditModalContent selectedIds={selectedIds} onDone={onDone} />,
    actions: [
      { label: 'Annuler', variant: 'secondary' },
      { label: 'Appliquer', variant: 'primary', id: submitButtonId },
    ],
  };
}
