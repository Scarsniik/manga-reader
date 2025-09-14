# Documentation de SearchAndSort.tsx

## Description

Le composant `SearchAndSort` est un composant React qui permet aux utilisateurs de rechercher et de trier une liste de Manga. Il fournit une interface utilisateur avec une barre de recherche et des options de tri.

## Propriétés

Le composant `SearchAndSort` accepte les propriétés suivantes :

- `mangaList` (Manga[]): La liste des mangas à afficher.
- `onSearch` (function): Fonction de rappel appelée lorsque l'utilisateur effectue une recherche.
- `defaultSort` (string): Critère de tri par défaut.
- `defaultSearch` (string): Texte de recherche par défaut.

### OnSearch

La fonction `onSearch` est appelée lorsque l'utilisateur effectue une recherche ou un tri. Elle prend en paramètre un objet contenant la liste d'entrée filtrée et triée.

## Visuel

Le composant affiche une barre de recherche avec un bouton Rechercher.
En dessous, un bouton discret "Voir plus de filtres". Au clic sur ce bouton, le composant s'agrandit vers le bas pour afficher des options de tri supplémentaires.
Il y a un tagPicker et un select pour le tri.

Quand on selectionne des tags, une phrase de résumé des choix s'affiche au dessus de la barre de recherche même quand le composant est réduit.

## Technique

- Utilisation de useTags pour avoir les tags.
- Utiliser useParams (le mien, pas celui de react src/rendererhooks/useParams.tsx) pour avoir les parametres de l'appli (notement displayHidden qui permet de savoir si on affiche les mangas cachés ou pas).
