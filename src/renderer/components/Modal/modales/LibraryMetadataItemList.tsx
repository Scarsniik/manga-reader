import React, { useState } from "react";
import {
  EditPencilIcon,
  TrashCanIcon,
} from "@/renderer/components/icons";
import buildConfirmActionModal from "@/renderer/components/Modal/modales/ConfirmActionModal";
import {
  getMetadataDeleteTitle,
  normalizeMetadataName,
  type MetadataItem,
  type MetadataTab,
} from "@/renderer/components/Modal/modales/libraryMetadata";
import { useModal } from "@/renderer/hooks/useModal";

type Props = {
  items: MetadataItem[];
  query: string;
  singular: string;
  tab: MetadataTab;
  validateName: (name: string, ignoredId?: string) => string | null;
  onDelete: (item: MetadataItem) => Promise<void>;
  onError: (message: string) => void;
  onUpdate: (item: MetadataItem, name: string, hidden: boolean) => Promise<void>;
};

export default function LibraryMetadataItemList({
  items,
  query,
  singular,
  tab,
  validateName,
  onDelete,
  onError,
  onUpdate,
}: Props) {
  const { openModal } = useModal();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftHidden, setDraftHidden] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const resetEditor = () => {
    setEditingId(null);
    setDraftName("");
    setDraftHidden(false);
  };

  const startEditing = (item: MetadataItem) => {
    setEditingId(item.id);
    setDraftName(item.name);
    setDraftHidden(Boolean(item.hidden));
    onError("");
  };

  const saveItem = async (item: MetadataItem) => {
    const normalizedName = normalizeMetadataName(draftName);
    const validationError = validateName(normalizedName, item.id);
    if (validationError) {
      onError(validationError);
      return;
    }

    setBusyId(item.id);
    onError("");
    try {
      await onUpdate(item, normalizedName, draftHidden);
      resetEditor();
    } catch (error) {
      onError(`Impossible de modifier ce ${singular}.`);
      console.error("Failed to update library metadata", error);
    } finally {
      setBusyId(null);
    }
  };

  const deleteItem = async (item: MetadataItem) => {
    setBusyId(item.id);
    onError("");
    try {
      await onDelete(item);
      if (editingId === item.id) {
        resetEditor();
      }
    } catch (error) {
      onError(`Impossible de supprimer ce ${singular}.`);
      console.error("Failed to delete library metadata", error);
    } finally {
      setBusyId(null);
    }
  };

  const askToDelete = (item: MetadataItem) => {
    openModal(buildConfirmActionModal({
      title: getMetadataDeleteTitle(tab),
      message: (
        <>
          Supprimer <strong>{item.name}</strong> de la bibliothèque ?
          <span className="library-metadata__delete-warning">
            Cette valeur ne sera plus proposée dans les fiches manga.
          </span>
        </>
      ),
      confirmLabel: "Supprimer",
      confirmVariant: "danger",
      onConfirm: () => deleteItem(item),
    }));
  };

  if (items.length === 0) {
    return (
      <div className="library-metadata__list">
        <div className="library-metadata__empty">
          <span aria-hidden="true">{query ? "⌕" : "+"}</span>
          <strong>{query ? "Aucun résultat" : `Aucun ${singular}`}</strong>
          <p>
            {query
              ? "Essayez une recherche plus courte ou effacez le filtre."
              : `Ajoutez votre premier ${singular} avec le formulaire ci-dessus.`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="library-metadata__list">
      {items.map((item) => {
        const isEditing = editingId === item.id;
        const isBusy = busyId === item.id;

        return (
          <div className={`library-metadata__item ${isEditing ? "is-editing" : ""}`} key={item.id}>
            <span className={`library-metadata__item-mark is-${tab}`} aria-hidden="true">
              {tab === "tags" ? "#" : item.name.charAt(0).toLocaleUpperCase()}
            </span>

            {isEditing ? (
              <form
                className="library-metadata__edit"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveItem(item);
                }}
              >
                <input
                  autoFocus
                  type="text"
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  aria-label={`Modifier ${item.name}`}
                />
                {tab === "tags" ? (
                  <label>
                    <input
                      type="checkbox"
                      checked={draftHidden}
                      onChange={(event) => setDraftHidden(event.target.checked)}
                    />
                    Masqué
                  </label>
                ) : null}
                <div className="library-metadata__edit-actions">
                  <button type="button" onClick={resetEditor}>Annuler</button>
                  <button type="submit" className="is-primary" disabled={!draftName.trim() || isBusy}>
                    {isBusy ? "Enregistrement..." : "Enregistrer"}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="library-metadata__item-name">
                  <strong>{item.name}</strong>
                  {tab === "tags" ? (
                    <span className={item.hidden ? "is-hidden" : ""}>
                      {item.hidden ? "Masqué" : "Visible"}
                    </span>
                  ) : null}
                </div>
                <div className="library-metadata__item-actions">
                  <button type="button" onClick={() => startEditing(item)} title={`Modifier ${item.name}`}>
                    <EditPencilIcon aria-hidden="true" />
                    <span>Modifier</span>
                  </button>
                  <button
                    type="button"
                    className="is-danger"
                    disabled={isBusy}
                    onClick={() => askToDelete(item)}
                    title={`Supprimer ${item.name}`}
                  >
                    <TrashCanIcon aria-hidden="true" />
                    <span>Supprimer</span>
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
