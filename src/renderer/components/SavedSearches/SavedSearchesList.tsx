import React from "react";
import { ChevronDownIcon, TrashCanIcon } from "@/renderer/components/icons";
import "@/renderer/components/SavedSearches/SavedSearchesList.scss";

export type SavedSearchListItem = {
    id: string;
    name: string;
};

type Props<TSearch extends SavedSearchListItem> = {
    searches: TSearch[];
    expanded: boolean;
    deleteMode: boolean;
    onToggleExpanded: () => void;
    onToggleDeleteMode: () => void;
    onSearchClick: (search: TSearch) => void;
};

const SavedSearchesList = <TSearch extends SavedSearchListItem>({
    searches,
    expanded,
    deleteMode,
    onToggleExpanded,
    onToggleDeleteMode,
    onSearchClick,
}: Props<TSearch>) => (
    <section
        className={[
            "saved-searches-list",
            expanded ? "saved-searches-list--expanded" : "",
            deleteMode ? "saved-searches-list--delete-mode" : "",
        ].filter(Boolean).join(" ")}
        aria-label="Recherches enregistrees"
    >
        <div className="saved-searches-list__header">
            <button
                type="button"
                className="saved-searches-list__toggle"
                onClick={onToggleExpanded}
                aria-expanded={expanded}
                aria-controls="saved-searches-list-panel"
            >
                <span>Recherches enregistrees</span>
                <span className="saved-searches-list__count">{searches.length}</span>
                <span className="saved-searches-list__chevron" aria-hidden="true">
                    <ChevronDownIcon focusable="false" />
                </span>
            </button>

            {expanded ? (
                <button
                    type="button"
                    className="saved-searches-list__delete-toggle"
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
            id="saved-searches-list-panel"
            className="saved-searches-list__list-shell"
            data-expanded={expanded ? "true" : "false"}
        >
            <div className="saved-searches-list__list">
                {searches.map((search) => (
                    <button
                        key={search.id}
                        type="button"
                        className="saved-searches-list__tag"
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

export default SavedSearchesList;
