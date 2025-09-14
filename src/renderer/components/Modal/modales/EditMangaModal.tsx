import React, { useRef, useContext } from 'react';
import { ModalOptions } from '@/renderer/context/ModalContext';
import Form from '@/renderer/components/utils/Form/Form';
import type { Field } from '@/renderer/components/utils/Form/types';
import TagsContext from '@/renderer/context/TagsContext';
import TagItem from '@/renderer/components/Tag/TagItem';
import { useState } from 'react';

import '@/renderer/components/Modal/style.scss';
import useTags from '@/renderer/hooks/useTags';
import { Manga } from '@/renderer/types';

export type EditMangaInput = {
  id: string;
  title: string;
  path?: string;
};

// Build a ModalOptions object to edit a manga's title and path using the reusable Form component
export default function buildEditMangaModal(manga: Manga | EditMangaInput): ModalOptions {
  const formId = `edit-manga-form-${manga.id}`;
  const submitButtonId = `edit-manga-action-save-${manga.id}`;

  const EditContent: React.FC = () => {
    const submittedRef = useRef(false);

    const {tags} = useTags();

    const fields: Field[] = [
      { name: 'title', label: 'Titre', type: 'text', required: true },
      { name: 'tags', label: 'Tags', type: 'tagsPicker', options: tags.map(t => ({ label: t.name, value: t.id })) },
      { name: 'path', label: 'Emplacement', type: 'text' },
    ];

    const handleSubmit = async (values: Record<string, any>) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
  const current: EditMangaInput & { tagIds?: string[] } = { id: manga.id, title: values.title ?? '', path: values.path ?? '' };
  // include tagIds from selection (tags field comes from the Form)
  current.tagIds = values.tags || []
      console.log("[EditMangaModal] handleSubmit values", values);
      try {
        if (!window.api || typeof window.api.updateManga !== 'function') {
          console.error('updateManga not available');
          return;
        }
        await window.api.updateManga(current);
        // notify app to reload mangas
        try { window.dispatchEvent(new CustomEvent('mangas-updated')); } catch (e) { /* noop */ }
      } catch (err) {
        console.error('Failed to update manga', err);
        alert("Impossible d'enregistrer les modifications");
      }
    };

    console.log('EditMangaModal render', { manga });

    return (
      <div>
        <Form
          fields={fields}
          initialValues={{ title: manga.title, path: manga.path, tags: (manga as Manga).tagIds || [] }}
          onSubmit={handleSubmit}
          formId={formId}
          submitButtonId={submitButtonId}
          submitLabel="Enregistrer"
        />
      </div>
    );
  };

  return {
    title: `Éditer: ${manga.title}`,
    content: <EditContent />,
    actions: [
      {
        label: 'Annuler',
        variant: 'secondary'
      },
      {
        label: 'Enregistrer',
        variant: 'primary',
        id: submitButtonId,
      },
    ],
  };
}
