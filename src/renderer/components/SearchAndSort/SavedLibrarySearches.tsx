import React from "react";
import { ChevronDownIcon, TrashCanIcon } from "@/renderer/components/icons";
import type { SavedLibrarySearch } from "@/renderer/types";
import "@/renderer/components/SearchAndSort/SavedLibrarySearches.scss";

type Props = {
    searches: SavedLibrarySearch[];
    expanded: boolean;
    deleteMode: boolean;
    onToggleExpanded: () => void;
    onToggleDeleteMode: () => void;
    onSearchClick: (search: SavedLibrarySearch) => void;
};

const SavedLibrarySearches: React.FC<Props> = ({
    searches,
    expanded,
    deleteMode,
    onToggleExpanded,
    onToggleDeleteMode,
    onSearchClick,
}) => (
    <section
        className={[
            "saved-library-searches",
            expanded ? "saved-library-searches--expanded" : "",
            deleteMode ? "saved-library-searches--delete-mode" : "",
        ].filter(Boolean).join(" ")}
        aria-label="Recherches enregistrees"
    >
        <div className="saved-library-searches__header">
            <button
                type="button"
                className="saved-library-searches__toggle"
                onClick={onToggleExpanded}
                aria-expanded={expanded}
                aria-controls="saved-library-searches-list"
            >
                <span>Recherches enregistrees</span>
                <span className="saved-library-searches__count">{searches.length}</span>
                <span className="saved-library-searches__chevron" aria-hidden="true">
                    <ChevronDownIcon focusable="false" />
                </span>
            </button>

            {expanded ? (
                <button
                    type="button"
                    className="saved-library-searches__delete-toggle"
                    onClick={onToggleDeleteMode}
                    aria-pressed={deleteMode}
                    title={deleteMode ? "Quitter le mode suppression" : "Activer le mode suppression"}
                >
                    <TrashCanIcon focusable="false" />
                    <span>{deleteMode ? "Annuler" : "Supprimer"}</span>
                </button>
            ) : null}
        </div>

        <div
            id="saved-library-searches-list"
            className="saved-library-searches__list-shell"
            data-expanded={expanded ? "true" : "false"}
        >
            <div className="saved-library-searches__list">
                {searches.map((search) => (
                    <button
                        key={search.id}
                        type="button"
                        className="saved-library-searches__tag"
                        onClick={() => onSearchClick(search)}
                        title={deleteMode ? `Supprimer "${search.name}"` : `Rejouer "${search.name}"`}
                    >
                        {search.name}
                    </button>
                ))}
            </div>
        </div>
    </section>
);

export default SavedLibrarySearches;
