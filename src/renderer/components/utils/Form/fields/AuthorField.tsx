import "./AuthorField.scss";
import React, { useMemo, useState } from "react";
import useAuthors from "@/renderer/hooks/useAuthors";
import { Field as FieldType } from "../types";
import EntityPickerField from "./EntityPickerField";

interface Props {
  field: FieldType;
  value: string | null;
  onChange: (e: any) => void;
  disableCreate?: boolean;
}

export default function AuthorField({ field, value, onChange, disableCreate = false }: Props) {
  const { authors, addAuthor, removeAuthor, refresh } = useAuthors();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sortedAuthors = useMemo(
    () => [...authors]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((author) => ({
        id: author.id,
        name: author.name,
      })),
    [authors],
  );

  async function handleCreate(e: React.FormEvent | React.MouseEvent | React.KeyboardEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await addAuthor({ name: newName.trim() });
      setNewName("");
      await refresh();
      if (res && res.length > 0) {
        const last = res[res.length - 1];
        onChange({
          target: { value: last.id, name: field.name },
        } as any);
      }
    } catch (err: any) {
      setError("Erreur lors de la création de l'auteur.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (!window.confirm("Supprimer cet auteur ?")) return;
    await removeAuthor(value!);
    await refresh();
    onChange({ target: { value: "", name: field.name } } as any);
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreate(e);
    }
  }

  return (
    <div className="mh-author-field">
      <EntityPickerField
        field={field}
        options={sortedAuthors}
        value={value ? [value] : []}
        onChange={onChange}
        placeholder={field.placeholder || "Rechercher un auteur..."}
        singleSelect
      />

      {!disableCreate && (
        <div className="mh-author-field__actions">
          <div className="mh-author-field__create">
            <input
              type="text"
              placeholder="Nouvel auteur"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="mh-author-field__input"
              disabled={creating}
              onKeyDown={handleInputKeyDown}
            />
            <button
              type="button"
              className="mh-author-field__add"
              disabled={creating || !newName.trim()}
              onClick={handleCreate}
            >
              +
            </button>
          </div>
          {value ? (
            <button
              type="button"
              title="Supprimer l'auteur"
              className="mh-author-field__danger"
              onClick={handleDelete}
            >
              Supprimer l'auteur
            </button>
          ) : null}
        </div>
      )}

      {error && <div className="mh-author-field__error">{error}</div>}
    </div>
  );
}
