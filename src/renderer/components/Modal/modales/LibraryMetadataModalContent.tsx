import React, { useMemo, useState } from "react";
import {
  MagnifyingGlassIcon,
  PlusSignIcon,
} from "@/renderer/components/icons";
import LibraryMetadataItemList from "@/renderer/components/Modal/modales/LibraryMetadataItemList";
import {
  METADATA_TAB_DEFINITIONS,
  normalizeMetadataName,
  type MetadataItem,
  type MetadataTab,
} from "@/renderer/components/Modal/modales/libraryMetadata";
import useAuthors from "@/renderer/hooks/useAuthors";
import useSeries from "@/renderer/hooks/useSeries";
import useTags from "@/renderer/hooks/useTags";
import type { Author, Series, Tag } from "@/renderer/types";
import "@/renderer/components/Modal/modales/LibraryMetadataModalContent.scss";

export default function LibraryMetadataModalContent() {
  const { tags, addTag, removeTag, updateTag } = useTags();
  const { authors, addAuthor, removeAuthor, updateAuthor } = useAuthors();
  const {
    series,
    addSeries,
    removeSeries,
    updateSeries,
  } = useSeries();
  const [activeTab, setActiveTab] = useState<MetadataTab>("tags");
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [newTagHidden, setNewTagHidden] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  const activeDefinition = (
    METADATA_TAB_DEFINITIONS.find((tab) => tab.id === activeTab)
    ?? METADATA_TAB_DEFINITIONS[0]
  );

  const itemsByTab = useMemo<Record<MetadataTab, MetadataItem[]>>(() => ({
    tags: tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      hidden: Boolean(tag.hidden),
      source: tag,
    })),
    authors: authors.map((author) => ({
      id: author.id,
      name: author.name,
      source: author,
    })),
    series: series.map((item) => ({
      id: item.id,
      name: item.title,
      source: item,
    })),
  }), [authors, series, tags]);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    return [...itemsByTab[activeTab]]
      .filter((item) => !normalizedQuery || item.name.toLocaleLowerCase().includes(normalizedQuery))
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
  }, [activeTab, itemsByTab, query]);

  const selectTab = (tab: MetadataTab) => {
    setActiveTab(tab);
    setQuery("");
    setNewName("");
    setNewTagHidden(false);
    setError("");
  };

  const validateName = (name: string, ignoredId?: string): string | null => {
    const normalizedName = normalizeMetadataName(name);
    if (!normalizedName) {
      return "Le nom ne peut pas être vide.";
    }

    const alreadyExists = itemsByTab[activeTab].some((item) => (
      item.id !== ignoredId
      && normalizeMetadataName(item.name).toLocaleLowerCase() === normalizedName.toLocaleLowerCase()
    ));

    return alreadyExists ? `${activeDefinition.label.slice(0, -1)} déjà existant(e).` : null;
  };

  const createItem = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedName = normalizeMetadataName(newName);
    const validationError = validateName(normalizedName);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsCreating(true);
    setError("");
    try {
      if (activeTab === "tags") {
        await addTag({ name: normalizedName, hidden: newTagHidden });
      } else if (activeTab === "authors") {
        await addAuthor({ name: normalizedName });
      } else {
        await addSeries({ title: normalizedName });
      }
      setNewName("");
      setNewTagHidden(false);
    } catch (creationError) {
      setError(`Impossible d’ajouter ce ${activeDefinition.singular}.`);
      console.error("Failed to create library metadata", creationError);
    } finally {
      setIsCreating(false);
    }
  };

  const updateItem = async (item: MetadataItem, name: string, hidden: boolean) => {
    if (activeTab === "tags") {
      await updateTag({ ...(item.source as Tag), name, hidden });
    } else if (activeTab === "authors") {
      await updateAuthor({ ...(item.source as Author), name });
    } else {
      await updateSeries({ ...(item.source as Series), title: name });
    }
  };

  const deleteItem = async (item: MetadataItem) => {
    if (activeTab === "tags") {
      await removeTag(item.id);
    } else if (activeTab === "authors") {
      await removeAuthor(item.id);
    } else {
      await removeSeries(item.id);
    }
  };

  return (
    <div className="library-metadata">
      <div className="library-metadata__intro">
        <p>Gérez les informations réutilisables dans toutes les fiches de votre bibliothèque.</p>
        <span>{tags.length + authors.length + series.length} valeurs au total</span>
      </div>

      <div className="library-metadata__tabs" role="tablist" aria-label="Types de métadonnées">
        {METADATA_TAB_DEFINITIONS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "is-active" : ""}
            onClick={() => selectTab(tab.id)}
          >
            <span className={`library-metadata__tab-icon is-${tab.id}`} aria-hidden="true">
              {tab.id === "tags" ? "#" : tab.id === "authors" ? "A" : "S"}
            </span>
            <span>
              <strong>{tab.label}</strong>
              <small>{itemsByTab[tab.id].length}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="library-metadata__toolbar">
        <div>
          <h3>{activeDefinition.label}</h3>
          <p>{activeDefinition.description}</p>
        </div>
        <label className="library-metadata__search">
          <MagnifyingGlassIcon aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Rechercher parmi ${itemsByTab[activeTab].length} ${activeDefinition.label.toLocaleLowerCase()}...`}
            aria-label={`Rechercher des ${activeDefinition.label.toLocaleLowerCase()}`}
          />
        </label>
      </div>

      <form className="library-metadata__create" onSubmit={createItem}>
        <div className="library-metadata__create-field">
          <label htmlFor={`new-${activeTab}`}>
            Ajouter {activeDefinition.singular === "auteur" ? "un auteur" : `une ${activeDefinition.singular}`}
          </label>
          <input
            id={`new-${activeTab}`}
            type="text"
            value={newName}
            onChange={(event) => {
              setNewName(event.target.value);
              setError("");
            }}
            placeholder={activeDefinition.placeholder}
          />
        </div>
        {activeTab === "tags" ? (
          <label className="library-metadata__hidden-toggle">
            <input
              type="checkbox"
              checked={newTagHidden}
              onChange={(event) => setNewTagHidden(event.target.checked)}
            />
            Masqué
          </label>
        ) : null}
        <button type="submit" disabled={!newName.trim() || isCreating}>
          <PlusSignIcon aria-hidden="true" />
          {isCreating ? "Ajout..." : "Ajouter"}
        </button>
      </form>

      {error ? <div className="library-metadata__error" role="alert">{error}</div> : null}

      <div className="library-metadata__results-heading">
        <span>
          {visibleItems.length === itemsByTab[activeTab].length
            ? `${visibleItems.length} élément(s)`
            : `${visibleItems.length} résultat(s) sur ${itemsByTab[activeTab].length}`}
        </span>
        {query ? (
          <button type="button" onClick={() => setQuery("")}>Effacer la recherche</button>
        ) : null}
      </div>

      <LibraryMetadataItemList
        items={visibleItems}
        query={query}
        singular={activeDefinition.singular}
        tab={activeTab}
        validateName={validateName}
        onDelete={deleteItem}
        onError={setError}
        onUpdate={updateItem}
      />
    </div>
  );
}
