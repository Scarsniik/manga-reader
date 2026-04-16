import React, { useState } from "react";
import "@/renderer/components/SearchAndSort/SaveLibrarySearchModalContent.scss";

type Props = {
    onCancel: () => void;
    onSubmit: (name: string) => void;
};

const SaveLibrarySearchModalContent: React.FC<Props> = ({
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
        <form className="save-library-search-modal" onSubmit={handleSubmit}>
            <label className="save-library-search-modal__label" htmlFor="saved-library-search-name">
                Nom de la recherche
            </label>
            <input
                id="saved-library-search-name"
                className="save-library-search-modal__input"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex: Mangas japonais en cours"
                autoFocus
            />
            <div className="save-library-search-modal__actions">
                <button
                    type="button"
                    className="save-library-search-modal__button save-library-search-modal__button--secondary"
                    onClick={onCancel}
                >
                    Annuler
                </button>
                <button
                    type="submit"
                    className="save-library-search-modal__button save-library-search-modal__button--primary"
                    disabled={!canSubmit}
                >
                    Enregistrer
                </button>
            </div>
        </form>
    );
};

export default SaveLibrarySearchModalContent;
