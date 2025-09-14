# Documentation de Reader.tsx

Ce fichier est un composant React qui gère l'affichage et la navigation des pages d'un manga dans une application de lecture de mangas. Voici une explication détaillée de son fonctionnement :

- Prend en param d'URL l'identifiant du manga à afficher et la page de départ.
- Va chercher les informations du manga dans le fichier "mangas.json" situé dans le dossier de l'application dans app data.
- Charge les images du manga depuis le dossier spécifié dans les données du manga.
- Navigation avec le clavier (fleches et zqsd) et la souris (clic gauche/droite) sur l'image.
- Affiche la page actuelle et le nombre total de pages.
- Un bouton pour retourner à la liste des mangas.

## Choses à ajouter

Le reader doit inclure un systeme de OCR pour les mangas en japonais. Ce systeme doit permettre de traduire le texte japonais en français ou en anglais.

Fonctionnement :

0. L'activation de l'OCR est optionnelle et peut être activée/désactivée par l'utilisateur avec un bouton à droite du titre. Quand activé, le lecteur se met à gauche de l'écran et l'OCR à droite.
1. Utilisation de la bibliothèque [manga-ocr](https://github.com/kha-white/manga-ocr) pour la reconnaissance optique de caractères (OCR).
2. Lors du chargement d'une page, l'image est envoyée à manga-ocr pour extraire le texte.
3. Le texte extrait est ensuite traduit en utilisant une API de traduction (jpdb)
4. L'OCR donne la position des textes sur l'image pour qu'on puisse cliquer sur les bulles et afficher la traduction.
5. Quand on clique sur le texte, une section sort en dessous de l'image avec le texte séparé en vocabulaire par l'API jpdb.
