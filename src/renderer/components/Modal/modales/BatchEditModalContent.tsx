import React, { useRef } from 'react';
import Form from '@/renderer/components/utils/Form/Form';
import type { Field } from '@/renderer/components/utils/Form/types';
import useModal from '@/renderer/hooks/useModal';
import { languages } from '@/renderer/consts/languages';

type Props = {
  selectedIds: string[];
  onDone?: () => void;
};

export default function BatchEditModalContent({ selectedIds, onDone }: Props) {
  const submittedRef = useRef(false);
  const { closeModal } = useModal();
  const formId = `batch-edit-form-${selectedIds.join('-')}`;
  const submitButtonId = `batch-edit-submit-${selectedIds.length}`;

  const fields: Field[] = [
    { name: "language", label: 'Langue', type: 'select', options: languages.map(l => ({ label: l.frenchName, value: l.code })), placeholder: 'Sélectionner une langue' },
    { name: 'addTags', label: 'Tags à ajouter', type: 'tagsPicker' } as any,
    { name: 'removeTags', label: 'Tags à supprimer', type: 'tagsPicker' } as any,
  ];

  const handleSubmit = async (values: Record<string, any>) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    if (!window.api || typeof window.api.batchUpdateTags !== 'function') {
      alert('Opération non disponible (ipc manquant)');
      return;
    }

    try {
      const payload = {
        mangaIds: selectedIds,
        addTagIds: values.addTags || [],
        removeTagIds: values.removeTags || [],
        language: values.language || null,
      };
      const res = await window.api.batchUpdateTags(payload);
      if (res && res.success) {
        try { window.dispatchEvent(new CustomEvent('mangas-updated')); } catch (e) { /* noop */ }
        onDone && onDone();
      } else {
        alert('Échec de la modification en masse');
      }
    } catch (err) {
      console.error('batchUpdateTags failed', err);
      alert('Erreur lors de la modification en masse');
    }
  };

  return (
    <div>
      <p>{selectedIds.length} mangas sélectionnés</p>
      <Form
        fields={fields}
        initialValues={{ addTags: [], removeTags: [] }}
        onSubmit={handleSubmit}
        formId={formId}
        submitButtonId={submitButtonId}
        submitLabel="Appliquer"
      />
    </div>
  );
}
