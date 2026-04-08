# Documentation de SeriesCard.tsx

Ce composant reprend le principe de `MangaCard`, mais pour une série entière :

- il prend un `seriesId` à la place d'un manga ;
- il récupère les mangas liés à cette série pour afficher la couverture du premier manga ;
- il montre le nombre de mangas de la série à la place du nombre de pages ;
- il agrège les progressions de lecture de tous les mangas de la série pour la barre de progression ;
- son menu est volontairement réduit à la lecture, à la consultation de la série, et au filtre par auteur.
