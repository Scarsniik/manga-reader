import React from 'react';
import { ModalOptions } from '@/renderer/context/ModalContext';
import SettingsModalContent from './SettingsModalContent';

export default function buildSettingsModal(): ModalOptions {
  return {
    title: 'Paramètres',
    content: <SettingsModalContent />,
    actions: [
      { label: 'Fermer', variant: 'secondary' },
    ],
    className: 'settings-modal',
    bodyClassName: 'settings-modal-body',
  };
}
