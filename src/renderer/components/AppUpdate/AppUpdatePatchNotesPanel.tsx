import React, { useEffect, useState } from "react";
import {
    getAppUpdateApi,
    type AppUpdatePatchNote,
} from "@/renderer/components/AppUpdate/types";

type PatchNoteBlock =
    | { type: "heading"; text: string }
    | { type: "list"; items: string[] }
    | { type: "paragraph"; text: string };

type AppUpdatePatchNotesPanelProps = {
    title?: string;
    description?: string;
    limit?: number;
    fromVersion?: string | null;
    toVersion?: string | null;
    compact?: boolean;
    emptyMessage?: string;
};

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();

const shouldSkipHeading = (heading: string, note: AppUpdatePatchNote): boolean => {
    const normalizedHeading = normalizeWhitespace(heading).toLowerCase();
    if (!normalizedHeading) {
        return true;
    }

    const candidates = [
        note.title,
        note.tagName,
        note.version ? `v${note.version}` : null,
        note.version,
    ].map((value) => normalizeWhitespace(String(value || "")).toLowerCase()).filter(Boolean);

    return candidates.includes(normalizedHeading);
};

const parsePatchNoteBlocks = (body: string, note: AppUpdatePatchNote): PatchNoteBlock[] => {
    const lines = body.replace(/\r\n/g, "\n").split("\n");
    const blocks: PatchNoteBlock[] = [];
    let paragraphLines: string[] = [];
    let listItems: string[] = [];

    const flushParagraph = () => {
        if (paragraphLines.length === 0) {
            return;
        }

        blocks.push({
            type: "paragraph",
            text: normalizeWhitespace(paragraphLines.join(" ")),
        });
        paragraphLines = [];
    };

    const flushList = () => {
        if (listItems.length === 0) {
            return;
        }

        blocks.push({
            type: "list",
            items: listItems,
        });
        listItems = [];
    };

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            flushParagraph();
            flushList();
            continue;
        }

        if (/^#{1,6}\s+/.test(line)) {
            flushParagraph();
            flushList();

            const heading = line.replace(/^#{1,6}\s+/, "").trim();
            if (!shouldSkipHeading(heading, note)) {
                blocks.push({
                    type: "heading",
                    text: heading,
                });
            }
            continue;
        }

        if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
            flushParagraph();
            listItems.push(line.replace(/^([-*]|\d+\.)\s+/, "").trim());
            continue;
        }

        flushList();
        paragraphLines.push(line);
    }

    flushParagraph();
    flushList();

    return blocks;
};

const formatDate = (value?: string | null): string => {
    if (!value) {
        return "Date inconnue";
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium",
    }).format(parsed);
};

export default function AppUpdatePatchNotesPanel({
    title,
    description,
    limit,
    fromVersion,
    toVersion,
    compact = false,
    emptyMessage = "Aucune patchnote disponible pour le moment.",
}: AppUpdatePatchNotesPanelProps) {
    const [patchNotes, setPatchNotes] = useState<AppUpdatePatchNote[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const loadPatchNotes = async () => {
            const api = getAppUpdateApi();
            if (!api.appUpdateGetPatchNotes) {
                throw new Error("La lecture des patchnotes n'est pas disponible dans cette version.");
            }

            setLoading(true);
            setError(null);

            try {
                const result = await api.appUpdateGetPatchNotes({
                    limit,
                    fromVersion,
                    toVersion,
                });

                if (cancelled) {
                    return;
                }

                setPatchNotes(Array.isArray(result?.patchNotes) ? result.patchNotes : []);
            } catch (loadError) {
                if (cancelled) {
                    return;
                }

                setPatchNotes([]);
                setError(loadError instanceof Error ? loadError.message : String(loadError));
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void loadPatchNotes();

        return () => {
            cancelled = true;
        };
    }, [fromVersion, limit, toVersion]);

    const panelClassName = [
        "app-update-patchnotes",
        compact ? "compact" : "",
    ].filter(Boolean).join(" ");

    return (
        <section className={panelClassName}>
            {title || description ? (
                <div className="app-update-patchnotes__header">
                    {title ? <h4>{title}</h4> : null}
                    {description ? <p>{description}</p> : null}
                </div>
            ) : null}

            {loading ? <div className="app-update-message">Chargement des patchnotes...</div> : null}
            {!loading && error ? <div className="app-update-error">{error}</div> : null}
            {!loading && !error && patchNotes.length === 0 ? (
                <div className="app-update-message">{emptyMessage}</div>
            ) : null}

            {!loading && !error && patchNotes.length > 0 ? (
                <div className="app-update-patchnotes__list">
                    {patchNotes.map((note) => {
                        const blocks = note.body ? parsePatchNoteBlocks(note.body, note) : [];
                        const versionLabel = note.tagName || (note.version ? `v${note.version}` : note.title) || "Version";
                        const showSubtitle = Boolean(
                            note.title
                            && note.title !== note.tagName
                            && note.title !== note.version
                            && note.title !== `v${note.version || ""}`,
                        );

                        return (
                            <article key={note.tagName || note.version || note.title} className="app-update-patchnote-card">
                                <div className="app-update-patchnote-card__header">
                                    <div className="app-update-patchnote-card__title">
                                        <strong>{versionLabel}</strong>
                                        {showSubtitle ? <span>{note.title}</span> : null}
                                    </div>
                                    <time dateTime={note.publishedAt || undefined}>
                                        {formatDate(note.publishedAt)}
                                    </time>
                                </div>

                                {note.hasDetails && blocks.length > 0 ? (
                                    <div className="app-update-patchnote-card__content">
                                        {blocks.map((block, index) => {
                                            if (block.type === "heading") {
                                                return <h5 key={`${versionLabel}-heading-${index}`}>{block.text}</h5>;
                                            }

                                            if (block.type === "list") {
                                                return (
                                                    <ul key={`${versionLabel}-list-${index}`}>
                                                        {block.items.map((item, itemIndex) => (
                                                            <li key={`${versionLabel}-item-${itemIndex}`}>{item}</li>
                                                        ))}
                                                    </ul>
                                                );
                                            }

                                            return <p key={`${versionLabel}-paragraph-${index}`}>{block.text}</p>;
                                        })}
                                    </div>
                                ) : (
                                    <p className="app-update-patchnote-card__empty">
                                        Patchnote non renseignee pour cette version.
                                    </p>
                                )}
                            </article>
                        );
                    })}
                </div>
            ) : null}
        </section>
    );
}
