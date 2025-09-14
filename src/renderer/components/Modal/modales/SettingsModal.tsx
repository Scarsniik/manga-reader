import React from 'react';
import { ModalOptions } from '@/renderer/context/ModalContext';
import SettingsModalContent from './SettingsModalContent';

export default function buildSettingsModal(): ModalOptions {
  return {
    title: 'Paramètres',
    content: <SettingsModalContent />,
    // actions are handled inside the content (save button), keep a cancel fallback
    actions: [
      { label: 'Enregistrer', variant: 'primary', id: 'settings-save' },
      { label: 'Fermer', variant: 'secondary' },
    ],
  };
}
