import React from "react";
import {
    DownloadArrowIcon,
    EditPencilIcon,
    MagnifyingGlassIcon,
    PlusSignIcon,
    SettingsIcon,
} from "@/renderer/components/icons";
import MangaManagerViewMenu, {
    type MangaManagerViewOption,
} from "@/renderer/components/MangaManger/MangaManagerViewMenu";
import OcrScanIcon from "@/renderer/components/MangaManger/icons/ocr-scan.svg?react";
import ScrapersIcon from "@/renderer/components/MangaManger/icons/scrapers.svg?react";
import SelectionIcon from "@/renderer/components/MangaManger/icons/selection.svg?react";
import TagsIcon from "@/renderer/components/MangaManger/icons/tags.svg?react";

type Props = {
    activeDownloadJobCount: number;
    activeBackgroundSearchCount: number;
    activeViewId: string;
    isLibraryView: boolean;
    onAdd: () => void;
    onEditSelection: () => void;
    onOpenDownloads: () => void;
    onOpenBackgroundSearches: () => void;
    onOpenOcr: () => void;
    onOpenScrapers: () => void;
    onOpenSettings: () => void;
    onOpenTags: () => void;
    onOpenViewInWorkspace: (viewId: string) => void;
    onSelectView: (viewId: string) => void;
    onToggleSelection: () => void;
    selectedCount: number;
    selectionMode: boolean;
    viewOptions: MangaManagerViewOption[];
};

type HeaderButtonProps = {
    children: React.ReactNode;
    className?: string;
    icon: React.ReactNode;
    onClick: () => void;
    pressed?: boolean;
    title?: string;
};

function HeaderButton({
    children,
    className = "",
    icon,
    onClick,
    pressed,
    title,
}: HeaderButtonProps) {
    return (
        <button
            type="button"
            className={`mangaManager-header__button ${className}`.trim()}
            aria-pressed={pressed}
            onClick={onClick}
            title={title}
        >
            <span className="mangaManager-header__button-icon" aria-hidden="true">{icon}</span>
            <span className="mangaManager-header__button-label">{children}</span>
        </button>
    );
}

export default function MangaManagerHeader({
    activeDownloadJobCount,
    activeBackgroundSearchCount,
    activeViewId,
    isLibraryView,
    onAdd,
    onEditSelection,
    onOpenDownloads,
    onOpenBackgroundSearches,
    onOpenOcr,
    onOpenScrapers,
    onOpenSettings,
    onOpenTags,
    onOpenViewInWorkspace,
    onSelectView,
    onToggleSelection,
    selectedCount,
    selectionMode,
    viewOptions,
}: Props) {
    return (
        <header className="mangaManager-header">
            <div className="mangaManager-header__view">
                <MangaManagerViewMenu
                    activeViewId={activeViewId}
                    options={viewOptions}
                    onSelect={onSelectView}
                    onOpenInWorkspace={onOpenViewInWorkspace}
                />
            </div>

            <div className="mangaManager-header__actions" aria-label="Actions principales">
                {isLibraryView ? (
                    <div className="mangaManager-header__group">
                        <HeaderButton icon={<TagsIcon />} onClick={onOpenTags}>Tags</HeaderButton>
                        <HeaderButton icon={<OcrScanIcon />} onClick={onOpenOcr}>OCR</HeaderButton>
                    </div>
                ) : null}

                <div className="mangaManager-header__group">
                    <HeaderButton icon={<DownloadArrowIcon />} onClick={onOpenDownloads}>
                        Telechargements
                        {activeDownloadJobCount > 0 ? (
                            <span className="mangaManager-header__count">{activeDownloadJobCount}</span>
                        ) : null}
                    </HeaderButton>
                    <HeaderButton icon={<MagnifyingGlassIcon />} onClick={onOpenBackgroundSearches}>
                        Recherches
                        {activeBackgroundSearchCount > 0 ? (
                            <span className="mangaManager-header__count">{activeBackgroundSearchCount}</span>
                        ) : null}
                    </HeaderButton>
                    <HeaderButton icon={<SettingsIcon />} onClick={onOpenSettings}>Parametres</HeaderButton>
                    <HeaderButton icon={<ScrapersIcon />} onClick={onOpenScrapers}>Scrapers</HeaderButton>
                </div>

                {isLibraryView ? (
                    <div className="mangaManager-header__group mangaManager-header__group--contextual">
                        {selectedCount > 0 ? (
                            <HeaderButton
                                className="mangaManager-header__button--selection-action"
                                icon={<EditPencilIcon />}
                                onClick={onEditSelection}
                            >
                                Modifier <span className="mangaManager-header__count">{selectedCount}</span>
                            </HeaderButton>
                        ) : null}
                        <HeaderButton
                            className="mangaManager-header__button--toggle"
                            icon={<SelectionIcon />}
                            onClick={onToggleSelection}
                            pressed={selectionMode}
                            title="Activer ou quitter la selection multiple"
                        >
                            {selectionMode ? "Terminer" : "Selectionner"}
                        </HeaderButton>
                        <HeaderButton
                            className="mangaManager-header__button--primary"
                            icon={<PlusSignIcon />}
                            onClick={onAdd}
                        >
                            Ajouter
                        </HeaderButton>
                    </div>
                ) : null}
            </div>
        </header>
    );
}
