import React, { useState } from "react";
import "@/renderer/components/SavedSearches/SaveSearchModalContent.scss";

type Props = {
    onCancel: () => void;
    onSubmit: (name: string) => void;
};

const SaveSearchModalContent: React.FC<Props> = ({
    onCancel,
    onSubmit,
}) => {
    const [name, setName] = useState("");
    const trimmedName = name.trim();
    const canSubmit = trimmedName.length > 0;

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!canSubmit) return;

        onSubmit(trimmedName);
    };

    return (
        <form className="save-search-modal" onSubmit={handleSubmit}>
            <label className="save-search-modal__label" htmlFor="saved-search-name">
                Nom de la recherche
            </label>
            <input
                id="saved-search-name"
                className="save-search-modal__input"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex: Mangas japonais en cours"
                autoFocus
            />
            <div className="save-search-modal__actions">
                <button
                    type="button"
                    className="save-search-modal__button save-search-modal__button--secondary"
                    onClick={onCancel}
                >
                    Annuler
                </button>
                <button
                    type="submit"
                    className="save-search-modal__button save-search-modal__button--primary"
                    disabled={!canSubmit}
                >
                    Enregistrer
                </button>
            </div>
        </form>
    );
};

export default SaveSearchModalContent;
