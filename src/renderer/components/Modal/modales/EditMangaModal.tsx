import React, { useCallback, useMemo, useRef, useState } from "react";
import { ModalOptions } from "@/renderer/context/ModalContext";
import Form from "@/renderer/components/utils/Form/Form";
import type { FormItem } from "@/renderer/components/utils/Form/types";
import useAuthors from "@/renderer/hooks/useAuthors";
import useModal from "@/renderer/hooks/useModal";
import useSeries from "@/renderer/hooks/useSeries";
import useTags from "@/renderer/hooks/useTags";
import { Manga } from "@/renderer/types";
import { languages } from "@/renderer/consts/languages";
import "@/renderer/components/Modal/modales/EditMangaModal.scss";

export type EditMangaInput = {
  id: string;
  title: string;
  path?: string;
  tagIds?: string[];
  authorIds?: string[];
  language?: string | null;
  chapters?: string;
  seriesId?: string | null;
};

type EditMangaContentProps = {
  manga: Manga | EditMangaInput;
  formId: string;
  submitButtonId: string;
};

function EditMangaContent({
  manga,
  formId,
  submitButtonId,
}: EditMangaContentProps) {
  const submittedRef = useRef(false);
  const [saveError, setSaveError] = useState("");
  const { closeModal, openModal } = useModal();
  const { authors } = useAuthors();
  const { series } = useSeries();
  const { tags } = useTags();

  const fields = useMemo<FormItem[]>(() => [
    {
      type: "section",
      id: "identity",
      title: "Informations principales",
      description: "Les informations utilisées pour identifier et retrouver ce manga.",
      fields: [
        {
          name: "title",
          label: "Titre",
          type: "text",
          required: true,
          placeholder: "Titre du manga",
        },
        {
          name: "language",
          label: "Langue",
          type: "select",
          options: languages.map((language) => ({
            label: `${language.frenchName} — ${language.name}`,
            value: language.code,
          })),
          placeholder: "Sélectionner une langue",
        },
      ],
    },
    {
      type: "section",
      id: "classification",
      title: "Classement dans la bibliothèque",
      description: "Associez plusieurs auteurs, des tags et éventuellement une série.",
      fields: [
        {
          name: "authorIds",
          label: "Auteurs",
          type: "entityPicker",
          options: [...authors]
            .sort((left, right) => left.name.localeCompare(right.name))
            .map((author) => ({
              label: author.name,
              value: author.id,
            })),
          placeholder: "Rechercher et ajouter des auteurs...",
        },
        {
          name: "tags",
          label: "Tags",
          type: "tagsPicker",
          options: tags.map((tag) => ({
            label: tag.name,
            value: tag.id,
          })),
          placeholder: "Rechercher et ajouter des tags...",
        },
        {
          name: "seriesId",
          label: "Série",
          type: "series",
          placeholder: "Rechercher ou créer une série",
        },
        {
          name: "chapters",
          label: "Chapitre ou plage de chapitres",
          type: "text",
          placeholder: "Ex. 1 ou 1-5",
        },
        {
          name: "manageMetadata",
          label: "Besoin d’une nouvelle valeur ?",
          type: "action",
          actionId: "manage-library-metadata",
          buttonLabel: "Gérer les auteurs, tags et séries",
        },
      ],
    },
    {
      type: "section",
      id: "storage",
      title: "Fichiers",
      description: "Le dossier local qui contient les pages ou les chapitres.",
      fields: [
        {
          name: "path",
          label: "Emplacement",
          type: "text",
          pathPicker: "directory",
          placeholder: "Sélectionner le dossier du manga",
        },
      ],
    },
  ], [authors, tags]);

  const defaultValues = useMemo(() => ({
    title: manga.title,
    path: manga.path ?? "",
    tags: manga.tagIds ?? [],
    authorIds: manga.authorIds ?? [],
    language: manga.language ?? "",
    chapters: manga.chapters ?? "",
    seriesId: manga.seriesId ?? "",
  }), [manga]);

  const seriesTitle = series.find((item) => item.id === manga.seriesId)?.title;

  const handleSubmit = useCallback(async (values: Record<string, any>) => {
    if (submittedRef.current) {
      return;
    }

    submittedRef.current = true;
    setSaveError("");

    const updatedManga: EditMangaInput = {
      id: manga.id,
      title: String(values.title ?? "").trim(),
      path: String(values.path ?? ""),
      language: values.language || null,
      chapters: String(values.chapters ?? "").trim(),
      seriesId: values.seriesId || null,
      authorIds: Array.isArray(values.authorIds) ? values.authorIds : [],
      tagIds: Array.isArray(values.tags) ? values.tags : [],
    };

    try {
      if (!window.api || typeof window.api.updateManga !== "function") {
        throw new Error("updateManga is unavailable");
      }

      await window.api.updateManga(updatedManga);
      window.dispatchEvent(new CustomEvent("mangas-updated"));
      closeModal();
    } catch (error) {
      submittedRef.current = false;
      setSaveError("Impossible d’enregistrer les modifications. Vérifiez les informations puis réessayez.");
      console.error("Failed to update manga", error);
    }
  }, [closeModal, manga]);

  return (
    <div className="edit-manga-dialog">
      <div className="edit-manga-dialog__summary">
        <div className="edit-manga-dialog__monogram" aria-hidden="true">
          {manga.title.trim().charAt(0).toLocaleUpperCase() || "M"}
        </div>
        <div className="edit-manga-dialog__summary-copy">
          <strong>{manga.title}</strong>
          <span>
            {manga.authorIds?.length ?? 0} auteur(s)
            <i aria-hidden="true" />
            {manga.tagIds?.length ?? 0} tag(s)
            {seriesTitle ? <><i aria-hidden="true" />{seriesTitle}</> : null}
          </span>
        </div>
      </div>

      <Form
        fields={fields}
        initialValues={defaultValues}
        onSubmit={handleSubmit}
        formId={formId}
        submitButtonId={submitButtonId}
        submitLabel="Enregistrer"
        globalError={saveError}
        className="edit-manga-dialog__form"
        onAction={async (actionId) => {
          if (actionId === "manage-library-metadata") {
            const loadedModal = await import(
              "@/renderer/components/Modal/modales/LibraryMetadataModal.js"
            );
            const buildLibraryMetadataModal = loadedModal.default as unknown as () => ModalOptions;
            openModal(buildLibraryMetadataModal());
          }
        }}
      />
    </div>
  );
}

export default function buildEditMangaModal(manga: Manga | EditMangaInput): ModalOptions {
  const formId = `edit-manga-form-${manga.id}`;
  const submitButtonId = `edit-manga-action-save-${manga.id}`;

  return {
    title: "Gérer le manga",
    className: "edit-manga-modal",
    bodyClassName: "edit-manga-modal__body",
    content: (
      <EditMangaContent
        manga={manga}
        formId={formId}
        submitButtonId={submitButtonId}
      />
    ),
    actions: [
      {
        label: "Annuler",
        variant: "secondary",
      },
      {
        label: "Enregistrer les modifications",
        variant: "primary",
        id: submitButtonId,
        closeOnClick: false,
      },
    ],
  };
}
