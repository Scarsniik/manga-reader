# Documentation de Form.tsx

## Description

Ce composant expose de quoi faire un formulaire en suivant un type precis.
Il prend en props un tableau d'items de formulaire (`FormItem`) et une fonction de soumission (`onSubmit`).
Un item peut etre un champ (`Field`) ou une section (`FormSection`) avec un titre et ses champs.
Il gere aussi les erreurs de validation avec les propriétés "globalError" et "fieldErrors".
Dans un dossier fields, on trouve des composants pour chaque type de champ.

## Sections

Une section permet de grouper des champs sous un titre:

```ts
const fields: FormItem[] = [
  {
    type: 'section',
    id: 'reader',
    title: 'Lecteur',
    description: 'Options appliquees pendant la lecture.',
    fields: [
      {
        name: 'showPageNumbers',
        label: 'Afficher numeros de page',
        type: 'checkbox',
      },
    ],
  },
]
```

Les valeurs envoyees a `onSubmit` restent plates: les noms des champs de section sont au meme niveau que les autres champs.

## Chemins

Un champ `text` peut demander un chemin avec `pathPicker`. Le formulaire ajoute alors un bouton pour ouvrir le chemin et un bouton pour choisir un nouveau chemin.

```ts
{
  name: 'libraryPath',
  label: 'Chemin de la bibliotheque',
  type: 'text',
  pathPicker: 'directory',
}
```

Utilise `pathPicker: 'file'` pour choisir un fichier.

## Types de Fields

- `text`: Champ de texte simple.
- `number`: Champ numérique.
- `select`: Liste déroulante avec des options.
- `selectMulti`: Liste déroulante avec sélection multiple.
- `radio`: Boutons radio pour une sélection unique.
- `checkbox`: Case à cocher.
- `textarea`: Zone de texte multi-lignes.
- `file`: Champ de sélection de fichier ou dossier.
