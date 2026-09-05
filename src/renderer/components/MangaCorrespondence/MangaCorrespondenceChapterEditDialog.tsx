import React, { useMemo, useState } from "react";
import type {
  MangaCorrespondenceChapterOverride,
} from "@/renderer/backgroundSearch/types";
import type {
  MangaCorrespondenceChapterDetection,
} from "@/renderer/utils/mangaCorrespondenceTitleAnalysis";
import { formatMangaCorrespondenceChapterLabel } from "@/renderer/utils/mangaCorrespondenceChapter";

export type MangaCorrespondenceChapterEditEntry = {
  key: string;
  rawTitle: string;
  detectedChapter: string;
  chapterOverride?: MangaCorrespondenceChapterOverride;
  detection?: MangaCorrespondenceChapterDetection;
};

type Props = {
  mode: "match" | "group";
  entries: MangaCorrespondenceChapterEditEntry[];
  currentChapter: string;
  onSave: (value: string | null, replaceMatchOverrides: boolean) => Promise<void>;
  onReset: () => Promise<void>;
  onCancel: () => void;
};

const DETECTION_LABELS: Record<MangaCorrespondenceChapterDetection["source"], string> = {
  explicitChapter: "marqueur de chapitre explicite",
  explicitVolume: "marqueur de volume explicite",
  compoundTitle: "premier numéro d’un titre à double numérotation",
  bareTitleNumber: "numéro placé dans le titre",
  namedChapter: "chapitre nommé dans le titre",
  releaseDescriptor: "descripteur de publication",
};

const getInitialValue = (entries: MangaCorrespondenceChapterEditEntry[], currentChapter: string): string => {
  const overrideValues = Array.from(new Set(entries.map((entry) => (
    entry.chapterOverride?.value ?? ""
  ))));
  if (overrideValues.length === 1 && entries.every((entry) => entry.chapterOverride)) {
    return overrideValues[0];
  }
  return currentChapter === "Non renseigné" ? "" : currentChapter;
};

export default function MangaCorrespondenceChapterEditDialog({
  mode,
  entries,
  currentChapter,
  onSave,
  onReset,
  onCancel,
}: Props) {
  const matchOverrideCount = entries.filter((entry) => entry.chapterOverride?.scope === "match").length;
  const [value, setValue] = useState(() => getInitialValue(entries, currentChapter));
  const [replaceMatchOverrides, setReplaceMatchOverrides] = useState(() => (
    mode === "group" && matchOverrideCount === entries.length
  ));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canReset = mode === "match"
    ? entries.some((entry) => entry.chapterOverride)
    : entries.some((entry) => entry.chapterOverride?.scope === "group");
  const detectedValues = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.detectedChapter))),
    [entries],
  );

  const runAction = async (action: () => Promise<void>) => {
    setSubmitting(true);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Impossible d’enregistrer la correction.");
      setSubmitting(false);
    }
  };

  return (
    <div className="manga-correspondence-chapter-edit">
      <p className="manga-correspondence-chapter-edit__intro">
        {mode === "group"
          ? "Cette correction concerne " + entries.length + " correspondance(s) de la catégorie."
          : "Cette correction ne concerne que cette carte."}
      </p>

      <div className="manga-correspondence-chapter-edit__detected">
        <span>Valeur automatique conservée</span>
        <strong>{detectedValues.join(", ") || "Non renseigné"}</strong>
      </div>

      <label className="manga-correspondence-chapter-edit__field">
        <span>Numéro de chapitre ou de publication</span>
        <input
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Vide = non renseigné"
        />
        <small>
          {value.trim()
            ? formatMangaCorrespondenceChapterLabel(value.trim(), true)
            : "La carte sera placée dans « Non renseigné »."}
        </small>
      </label>

      {mode === "group" && matchOverrideCount > 0 ? (
        <label className="manga-correspondence-chapter-edit__replace">
          <input
            type="checkbox"
            checked={replaceMatchOverrides}
            onChange={(event) => setReplaceMatchOverrides(event.target.checked)}
          />
          <span>
            Remplacer aussi {matchOverrideCount} correction(s) faite(s) carte par carte
          </span>
        </label>
      ) : null}

      {mode === "match" ? entries.map((entry) => (
        <details key={entry.key} className="manga-correspondence-chapter-edit__explanation">
          <summary>Pourquoi ce classement ?</summary>
          <p>{entry.rawTitle}</p>
          <dl>
            <div>
              <dt>Détection</dt>
              <dd>{entry.detectedChapter}</dd>
            </div>
            <div>
              <dt>Origine</dt>
              <dd>{entry.detection ? DETECTION_LABELS[entry.detection.source] : "inférence ou donnée de la source"}</dd>
            </div>
            <div>
              <dt>Confiance</dt>
              <dd>{entry.detection?.confidence === "high"
                ? "élevée"
                : entry.detection?.confidence === "medium"
                  ? "moyenne"
                  : "faible"}</dd>
            </div>
            {entry.detection?.secondaryChapter ? (
              <div>
                <dt>Numéro secondaire</dt>
                <dd>
                  {entry.detection.secondaryChapter}
                  {entry.detection.secondaryLabel ? " · " + entry.detection.secondaryLabel : ""}
                </dd>
              </div>
            ) : null}
          </dl>
        </details>
      )) : null}

      {error ? <p className="manga-correspondence-chapter-edit__error">{error}</p> : null}
      <div className="manga-correspondence-chapter-edit__actions">
        <button type="button" className="secondary" disabled={submitting} onClick={onCancel}>
          Annuler
        </button>
        {canReset ? (
          <button
            type="button"
            className="secondary"
            disabled={submitting}
            onClick={() => void runAction(onReset)}
          >
            Revenir à l’automatique
          </button>
        ) : null}
        <button
          type="button"
          disabled={submitting}
          onClick={() => void runAction(() => onSave(value.trim() || null, replaceMatchOverrides))}
        >
          {submitting ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
