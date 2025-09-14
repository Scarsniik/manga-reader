# Documentation de Form.tsx

## Description

Ce composant  expose de quoi faire un formaulaire en suivant un type precis.
Il doit prendre en props un tableau de champs (Field) et une fonction de soumission (onSubmit).
Il gere aussi les erreurs de validation avec les propriétés "globalError" et "fieldErrors".
Dans un dossier fields, on trouve des composants pour chaque type de champ.

## Types de Fields

- `text`: Champ de texte simple.
- `number`: Champ numérique.
- `select`: Liste déroulante avec des options.
- `selectMulti`: Liste déroulante avec sélection multiple.
- `radio`: Boutons radio pour une sélection unique.
- `checkbox`: Case à cocher.
- `textarea`: Zone de texte multi-lignes.
- `file`: Champ de sélection de fichier ou dossier.
