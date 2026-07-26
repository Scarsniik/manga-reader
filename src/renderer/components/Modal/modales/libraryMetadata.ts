import type { Author, Series, Tag } from "@/renderer/types";

export type MetadataTab = "tags" | "authors" | "series";

export type MetadataItem = {
  id: string;
  name: string;
  hidden?: boolean;
  source: Author | Series | Tag;
};

export type MetadataTabDefinition = {
  id: MetadataTab;
  label: string;
  singular: string;
  description: string;
  placeholder: string;
};

export const METADATA_TAB_DEFINITIONS: MetadataTabDefinition[] = [
  {
    id: "tags",
    label: "Tags",
    singular: "tag",
    description: "Classez les mangas et masquez les contenus sensibles.",
    placeholder: "Nom du nouveau tag",
  },
  {
    id: "authors",
    label: "Auteurs",
    singular: "auteur",
    description: "Centralisez les auteurs proposés dans les fiches manga.",
    placeholder: "Nom du nouvel auteur",
  },
  {
    id: "series",
    label: "Séries",
    singular: "série",
    description: "Organisez les mangas qui appartiennent à une même série.",
    placeholder: "Titre de la nouvelle série",
  },
];

export const normalizeMetadataName = (value: string): string => (
  value.trim().replace(/\s+/g, " ")
);

export const getMetadataDeleteTitle = (tab: MetadataTab): string => {
  if (tab === "tags") {
    return "Supprimer le tag";
  }
  if (tab === "authors") {
    return "Supprimer l’auteur";
  }
  return "Supprimer la série";
};
