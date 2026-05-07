
import "./SeriesField.scss";
import React, { useMemo, useState } from "react";
import buildConfirmActionModal from "@/renderer/components/Modal/modales/ConfirmActionModal";
import { useModal } from "@/renderer/hooks/useModal";
import useSeries from "@/renderer/hooks/useSeries";
import { Field as FieldType } from "../types";
import EntityPickerField from "./EntityPickerField";

interface Props {
  field: FieldType;
  value: string | null;
  onChange: (e: any) => void;
  disableCreate?: boolean;
}

export default function SeriesField({ field, value, onChange, disableCreate = false }: Props) {
  const { openModal } = useModal();
  const { series, addSeries, removeSeries, refresh } = useSeries();
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sortedSeries = useMemo(
    () => [...series]
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((item) => ({
        id: item.id,
        name: item.title,
      })),
    [series],
  );
  const selectedSeriesTitle = useMemo(
    () => series.find((item) => item.id === value)?.title || "cette serie",
    [series, value],
  );

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

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();

    openModal(buildConfirmActionModal({
      title: "Supprimer la serie",
      message: (
        <>
          Supprimer <strong>{selectedSeriesTitle}</strong> ?
        </>
      ),
      confirmLabel: "Supprimer",
      confirmVariant: "danger",
      onConfirm: async () => {
        await removeSeries(value!);
        await refresh();
        onChange({ target: { value: "", name: field.name } } as any);
      },
    }));
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreate(e);
    }
  }

  return (
    <div className="mh-series-field">
      <EntityPickerField
        field={field}
        options={sortedSeries}
        value={value ? [value] : []}
        onChange={onChange}
        placeholder={field.placeholder || "Rechercher une série..."}
        singleSelect
      />

      {!disableCreate && (
        <div className="mh-series-field__actions">
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
          {value ? (
            <button
              type="button"
              title="Supprimer la série"
              className="mh-series-field__danger"
              onClick={handleDelete}
            >
              Supprimer la série
            </button>
          ) : null}
        </div>
      )}

      {error && <div className="mh-series-field__error">{error}</div>}
    </div>
  );
}
