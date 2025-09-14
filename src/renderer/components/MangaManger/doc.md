# Instructions pour le fichier MangaManager.tsx

Ce fichier est un composant React qui gère l'affichage et la manipulation des mangas dans une application. Voici une explication détaillée de son fonctionnement :

- Une ligne de titre qui contient aussi un bouton d'ajout de manga.
- Une liste de mangas affichée en utilisant des composants MangaCard.
- Un élément de drag and drop qui permet de drop un dossier n'importe où sur la fenetre pour ajouter un manga.

## Technique

- Lorsqu'un manga est ajouté, on va chercher le fichier "mangas.json" pour ajouter le manga à la liste. Si le fichier n'existe pas, on le crée. Le fichier doit se trouver dans le dossier de l'application dans app data.
