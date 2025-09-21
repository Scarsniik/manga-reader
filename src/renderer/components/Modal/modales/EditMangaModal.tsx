import React, { useRef, useCallback, useMemo } from "react";
import { ModalOptions } from "@/renderer/context/ModalContext";
import Form from "@/renderer/components/utils/Form/Form";
import type { Field } from "@/renderer/components/utils/Form/types";

import "@/renderer/components/Modal/style.scss";
import useTags from "@/renderer/hooks/useTags";
import { Manga } from "@/renderer/types";
import { languages } from "@/renderer/consts/languages";

export type EditMangaInput = {
  id: string;
  title: string;
  path?: string;
  tagIds?: string[];
  language?: string;
  chapters?: string; // chapter number or range as string, e.g. "1" or "1-5"
  seriesId?: string;
};

// Build a ModalOptions object to edit a manga"s title and path using the reusable Form component
export default function buildEditMangaModal(manga: Manga | EditMangaInput): ModalOptions {
  const formId = `edit-manga-form-${manga.id}`;
  const submitButtonId = `edit-manga-action-save-${manga.id}`;

  const EditContent: React.FC = () => {
    const submittedRef = useRef(false);

    const {tags} = useTags();

    const fields = useMemo<Field[]>(() => [
      {
        name: "title",
        label: "Titre",
        type: "text",
        required: true,
      }, {
        name: "language",
        label: "Langue",
        type: "select",
        options: languages.map(lang => ({
          label: `${lang.name} (${lang.frenchName})`,
          value: lang.code
        })),
        placeholder: "Sélectionner une langue",
      }, {
        name: "tags",
        label: "Tags",
        type: "tagsPicker",
        options: tags.map(t => ({
          label: t.name,
          value: t.id,
        })),
      }, {
        name: "seriesId",
        label: "Série",
        type: "series",
        placeholder: "Sélectionner une série",
      }, {
        name: "chapters",
        label: "Chapitres (Numéro ou Range ex: 1 ou 1-5)",
        type: "text",
      }, {
        name: "path",
        label: "Emplacement",
        type: "text",
      }
    ], [tags]);

    const defaultValues = useMemo(() => ({
      title: manga.title,
      path: manga.path,
      tags: manga.tagIds || [],
      language: manga.language,
      chapters: manga.chapters,
      seriesId: manga.seriesId,
    }), [manga]);

    const handleSubmit = useCallback(
      async (values: Record<string, any>) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      const current: EditMangaInput & { tagIds?: string[] } = {
        id: manga.id,
        title: values.title ?? "",
        path: values.path ?? "",
        language: values.language ?? "",
        chapters: values.chapters,
        seriesId: values.seriesId ?? null,
      };
      // include tagIds from selection (tags field comes from the Form)
      current.tagIds = values.tags || [];
      console.log("[EditMangaModal] handleSubmit values", values);
      try {
        if (!window.api || typeof window.api.updateManga !== "function") {
          console.error("updateManga not available");
          return;
        }
        await window.api.updateManga(current);
        // notify app to reload mangas
        try {
          window.dispatchEvent(new CustomEvent("mangas-updated"));
        } catch (e) {
        /* noop */
        }
      } catch (err) {
        console.error("Failed to update manga", err);
        alert("Impossible d'enregistrer les modifications");
      }
    },[manga, submittedRef]);

    return (
      <div>
        <Form
          fields={fields}
          initialValues={defaultValues}
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
        label: "Annuler",
        variant: "secondary"
      },
      {
        label: "Enregistrer",
        variant: "primary",
        id: submitButtonId,
      },
    ],
  };
}
