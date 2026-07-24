import React from "react";
import { CloseXIcon, PlusSignIcon } from "@/renderer/components/icons";
import { languages } from "@/renderer/consts/languages";
import { normalizeMultiSearchTitleLanguagePriority } from "@/renderer/components/MultiSearch/multiSearchTitleSelection";

type Props = {
  value: string[];
  onChange: (value: string[]) => void;
};

export default function MergedTitleLanguagePrioritySettings({
  value,
  onChange,
}: Props) {
  const normalizedValue = React.useMemo(
    () => normalizeMultiSearchTitleLanguagePriority(value),
    [value],
  );
  const availableLanguages = React.useMemo(
    () => languages.filter((language) => !normalizedValue.includes(language.code)),
    [normalizedValue],
  );
  const [languageToAdd, setLanguageToAdd] = React.useState("");
  const [draggedLanguageCode, setDraggedLanguageCode] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (availableLanguages.some((language) => language.code === languageToAdd)) return;
    setLanguageToAdd(availableLanguages[0]?.code ?? "");
  }, [availableLanguages, languageToAdd]);

  const addLanguage = () => {
    if (!languageToAdd || normalizedValue.includes(languageToAdd)) return;
    onChange([...normalizedValue, languageToAdd]);
  };

  const moveLanguage = (
    targetLanguageCode: string,
    position: "before" | "after",
  ) => {
    if (!draggedLanguageCode || draggedLanguageCode === targetLanguageCode) return;
    const reordered = normalizedValue.filter((languageCode) => languageCode !== draggedLanguageCode);
    const targetIndex = reordered.indexOf(targetLanguageCode);
    const insertionIndex = targetIndex < 0
      ? reordered.length
      : targetIndex + (position === "after" ? 1 : 0);
    reordered.splice(insertionIndex, 0, draggedLanguageCode);
    onChange(reordered);
  };

  return (
    <section className="settings-merged-title-languages">
      <div className="settings-merged-title-languages__heading">
        <h3>Langue du titre des cartes fusionnées</h3>
        <p>
          La première source trouvée dans la langue la plus haute de la liste fournit le titre de la carte.
          Les langues absentes gardent l’ordre naturel des résultats.
        </p>
      </div>

      <div className="settings-merged-title-languages__add">
        <select
          value={languageToAdd}
          onChange={(event) => setLanguageToAdd(event.currentTarget.value)}
          disabled={!availableLanguages.length}
          aria-label="Langue à ajouter"
        >
          {availableLanguages.map((language) => (
            <option key={language.code} value={language.code}>{language.frenchName}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={addLanguage}
          disabled={!languageToAdd}
          title="Ajouter cette langue"
          aria-label="Ajouter cette langue"
        >
          <PlusSignIcon aria-hidden="true" />
        </button>
      </div>

      {normalizedValue.length ? (
        <ol className="settings-merged-title-languages__list">
          {normalizedValue.map((languageCode, index) => {
            const language = languages.find((candidate) => candidate.code === languageCode);
            return (
              <li
                key={languageCode}
                className={draggedLanguageCode === languageCode ? "is-dragging" : ""}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const bounds = event.currentTarget.getBoundingClientRect();
                  moveLanguage(
                    languageCode,
                    event.clientY >= bounds.top + bounds.height / 2 ? "after" : "before",
                  );
                  setDraggedLanguageCode(null);
                }}
              >
                <button
                  type="button"
                  className="settings-merged-title-languages__handle"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", languageCode);
                    setDraggedLanguageCode(languageCode);
                  }}
                  onDragEnd={() => setDraggedLanguageCode(null)}
                  title="Glisser pour réordonner"
                  aria-label={`Réordonner ${language?.frenchName ?? languageCode}`}
                >
                  <span aria-hidden="true">⋮⋮</span>
                </button>
                <span className="settings-merged-title-languages__rank">{index + 1}</span>
                <span>{language?.frenchName ?? languageCode}</span>
                <button
                  type="button"
                  className="settings-merged-title-languages__remove"
                  onClick={() => onChange(normalizedValue.filter((code) => code !== languageCode))}
                  title="Retirer cette langue"
                  aria-label={`Retirer ${language?.frenchName ?? languageCode}`}
                >
                  <CloseXIcon aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="settings-merged-title-languages__empty">
          Aucune priorité : le premier résultat de chaque fusion fournit le titre.
        </p>
      )}
    </section>
  );
}
