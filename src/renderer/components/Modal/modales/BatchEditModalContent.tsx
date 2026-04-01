import React, { useEffect, useRef } from 'react';
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

  useEffect(() => {
    console.log('[BatchEditModal] mounted', {
      selectedCount: selectedIds.length,
      selectedIds,
      formId,
      submitButtonId,
    });

    return () => {
      console.log('[BatchEditModal] unmounted', {
        selectedCount: selectedIds.length,
        selectedIds,
      });
    };
  }, [formId, selectedIds, submitButtonId]);

  const fields: Field[] = [
    { name: "language", label: 'Langue', type: 'select', options: languages.map(l => ({ label: l.frenchName, value: l.code })), placeholder: 'Sélectionner une langue' },
    { name: 'authorId', label: 'Auteur', type: 'author', placeholder: 'Choisir un auteur' },
    { name: 'clearAuthor', label: "Retirer l'auteur", type: 'checkbox' },
    { name: 'seriesId', label: 'Série', type: 'series', placeholder: 'Choisir une série' },
    { name: 'clearSeries', label: 'Retirer la série', type: 'checkbox' },
    { name: 'addTags', label: 'Tags à ajouter', type: 'tagsPicker' },
    { name: 'removeTags', label: 'Tags à supprimer', type: 'tagsPicker' },
  ];

  const handleSubmit = async (values: Record<string, any>) => {
    console.log('[BatchEditModal] handleSubmit called', {
      selectedIds,
      values,
      alreadySubmitting: submittedRef.current,
    });
    if (submittedRef.current) return;
    submittedRef.current = true;
    if (!window.api || typeof window.api.batchUpdateTags !== 'function') {
      console.warn('[BatchEditModal] batchUpdateTags unavailable on window.api');
      submittedRef.current = false;
      alert('Opération non disponible (ipc manquant)');
      return;
    }

    try {
      const payload = {
        mangaIds: selectedIds,
        addTagIds: values.addTags || [],
        removeTagIds: values.removeTags || [],
        language: values.language || null,
        ...(values.clearAuthor ? { clearAuthor: true } : {}),
        ...(values.clearSeries ? { clearSeries: true } : {}),
        ...(!values.clearAuthor && values.authorId ? { authorId: values.authorId } : {}),
        ...(!values.clearSeries && values.seriesId ? { seriesId: values.seriesId } : {}),
      };
      console.log('[BatchEditModal] sending payload', payload);
      const res = await window.api.batchUpdateTags(payload);
      console.log('[BatchEditModal] batchUpdateTags response', res);
      if (res && res.success) {
        try { window.dispatchEvent(new CustomEvent('mangas-updated')); } catch (e) { /* noop */ }
        onDone && onDone();
        closeModal();
      } else {
        submittedRef.current = false;
        alert('Échec de la modification en masse');
      }
    } catch (err) {
      submittedRef.current = false;
      console.error('[BatchEditModal] batchUpdateTags failed', err);
      alert('Erreur lors de la modification en masse');
    }
  };

  return (
    <div>
      <p>{selectedIds.length} mangas sélectionnés</p>
      <Form
        fields={fields}
        initialValues={{
          authorId: "",
          clearAuthor: false,
          seriesId: "",
          clearSeries: false,
          addTags: [],
          removeTags: [],
        }}
        onSubmit={handleSubmit}
        formId={formId}
        submitButtonId={submitButtonId}
        submitLabel="Appliquer"
      />
    </div>
  );
}
