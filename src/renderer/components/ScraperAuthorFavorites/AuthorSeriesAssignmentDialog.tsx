import React from "react";
import FreeTextSuggestionInput from "@/renderer/components/utils/Form/fields/FreeTextSuggestionInput";
import { formatMangaCorrespondenceChapterLabel } from "@/renderer/utils/mangaCorrespondenceChapter";

type Props = {
  cardTitle: string;
  currentSeries: string;
  currentChapter: string;
  seriesOptions: string[];
  canReset: boolean;
  onCancel: () => void;
  onReset: () => Promise<void>;
  onSave: (series: string, chapter: string) => Promise<void>;
};

export default function AuthorSeriesAssignmentDialog({
  cardTitle,
  currentSeries,
  currentChapter,
  seriesOptions,
  canReset,
  onCancel,
  onReset,
  onSave,
}: Props) {
  const [series, setSeries] = React.useState(currentSeries);
  const [chapter, setChapter] = React.useState(currentChapter);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const runAction = async (action: () => Promise<void>) => {
    setSubmitting(true);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error
        ? actionError.message
        : "Impossible d’enregistrer la correction.");
      setSubmitting(false);
    }
  };

  return (
    <div className="author-series-assignment">
      <p>
        La correction s’applique à toutes les sources fusionnées dans la card
        <strong> {cardTitle}</strong>.
      </p>
      <FreeTextSuggestionInput
        label="Série"
        value={series}
        options={seriesOptions}
        placeholder="Saisir ou choisir une série"
        autoFocus
        onChange={setSeries}
      />
      <label className="author-series-assignment__field">
        <span>Numéro de chapitre ou de publication</span>
        <input
          value={chapter}
          onChange={(event) => setChapter(event.target.value)}
          placeholder="Vide = non renseigné"
        />
        <small>
          {chapter.trim()
            ? formatMangaCorrespondenceChapterLabel(chapter.trim(), true)
            : "La card sera considérée comme non numérotée."}
        </small>
      </label>
      <small className="author-series-assignment__hint">
        Le nom de série reste libre. Les séries existantes sont proposées selon la saisie.
      </small>
      {error ? <p className="author-series-assignment__error">{error}</p> : null}
      <div className="author-series-assignment__actions">
        <button type="button" className="secondary" disabled={submitting} onClick={onCancel}>
          Annuler
        </button>
        {canReset ? (
          <button
            type="button"
            className="secondary is-reset"
            disabled={submitting}
            onClick={() => void runAction(onReset)}
          >
            Revenir à l’automatique
          </button>
        ) : null}
        <button
          type="button"
          disabled={submitting}
          onClick={() => void runAction(() => onSave(series.trim(), chapter.trim()))}
        >
          {submitting ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
