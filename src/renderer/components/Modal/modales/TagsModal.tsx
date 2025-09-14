import React from 'react';
import { ModalOptions } from '@/renderer/context/ModalContext';
import TagsModalContent from './TagsModalContent';

export default function buildTagsModal(): ModalOptions {
  return {
    title: 'Tags',
    content: <TagsModalContent />,
    // actions are handled inside the content (save buttons on each tag), keep a cancel fallback
    actions: [
      { label: 'Fermer', variant: 'secondary' },
    ],
  };
}
