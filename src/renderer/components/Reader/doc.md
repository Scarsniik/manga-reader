# Reader

Le reader n'est plus porté par un seul fichier. `Reader.tsx` est désormais un conteneur qui compose des hooks métier et des composants d'affichage plus petits.

## Structure

- `Reader.tsx`
  - conteneur principal
  - lit les settings utilisateur
  - branche les hooks
  - connecte les composants d'UI
- `hooks/useReaderData.ts`
  - charge le manga et les pages
  - synchronise la page courante dans l'URL
  - persiste la progression de lecture
  - précharge les images voisines
- `hooks/useReaderNavigation.ts`
  - gère le retour, le changement de page et les transitions entre chapitres
  - gère la copie de l'image courante
  - expose les états dérivés de navigation
- `hooks/useReaderOcr.ts`
  - charge et met en cache l'OCR
  - gère les sélections manuelles
  - gère la sélection/focalisation des bulles OCR
- `hooks/useReaderShortcuts.ts`
  - centralise les raccourcis clavier
- `ReaderStage.tsx`
  - affiche la progression, l'image, la transition de chapitre ou l'état vide
- `ReaderEmptyState.tsx`
  - affiche l'état debug quand aucune image n'est disponible
- `ReaderControls.tsx`
  - affiche les boutons précédent/suivant
- `types.ts` / `utils.ts`
  - types et helpers partagés du reader

## Responsabilités fonctionnelles

- Le reader lit les paramètres d'URL `id` et `page`.
- Il supporte la lecture locale et la lecture issue d'un scraper.
- Il gère la navigation clavier/souris, la progression et le passage au chapitre précédent/suivant.
- L'OCR reste optionnel et s'affiche dans un panneau latéral dédié.
- Les zones OCR peuvent être détectées automatiquement ou ajoutées manuellement.
