
import "./SeriesField.scss";
import React, { useState } from "react";
import useSeries from "@/renderer/hooks/useSeries";
import { Field as FieldType } from "../types";

interface Props {
  field: FieldType;
  value: string | null;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  disableCreate?: boolean;
}

export default function SeriesField({ field, value, onChange, disableCreate = false }: Props) {
  const { series, addSeries, removeSeries, refresh } = useSeries();
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent | React.MouseEvent | React.KeyboardEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await addSeries({ title: newTitle.trim() });
      setNewTitle("");
      await refresh();
      // Sélectionne la dernière série ajoutée (supposée être la nouvelle)
      if (res && res.length > 0) {
        const last = res[res.length - 1];
        onChange({
          target: { value: last.id, name: field.name },
        } as any);
      }
    } catch (err: any) {
      setError("Erreur lors de la création de la série.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (!window.confirm("Supprimer cette série ?")) return;
    await removeSeries(value!);
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
    <div className="mh-series-field">
      <div className="mh-series-field__select-wrapper">
        <select
          id={field.name}
          name={field.name}
          value={value ?? ""}
          onChange={onChange}
          className="mh-series-field__select"
        >
          <option value="">--</option>
          {series.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        {!disableCreate && value && (
          <button
            type="button"
            title="Supprimer la série"
            className="mh-series-field__delete"
            onClick={handleDelete}
          >
            ×
          </button>
        )}
      </div>
      {!disableCreate && (
        <div className="mh-series-field__create">
          <input
            type="text"
            placeholder="Nouvelle série"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="mh-series-field__input"
            disabled={creating}
            onKeyDown={handleInputKeyDown}
          />
          <button
            type="button"
            className="mh-series-field__add"
            disabled={creating || !newTitle.trim()}
            onClick={handleCreate}
          >
            +
          </button>
        </div>
      )}
      {error && <div className="mh-series-field__error">{error}</div>}
    </div>
  );
}
